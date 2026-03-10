import type { CandidateWeights } from "../ga/types.js";
import type { JointAction } from "./actions.js";
import type { Coord } from "./protocol.js";
import {
  coordKey,
  inBounds,
  isSolid,
  isWall,
  moveCoord,
  nearestAppleDistance,
  type RuntimeState,
  type Snakebot,
} from "./state.js";

export interface FeatureVector {
  survivalImmediate: number;
  survivalAfterFall: number;
  applesEaten: number;
  nearestAppleDistance: number;
  appleRaceMargin: number;
  supportStability: number;
  selfCollisionRisk: number;
  enemyCollisionRisk: number;
  outOfBoundsRisk: number;
  reachableSpace: number;
  bodyCountDelta: number;
  headExposure: number;
}

export interface EvaluationResult {
  jointAction: JointAction;
  features: FeatureVector;
  score: number;
}

interface PredictedSnakebot {
  snakebotId: number;
  nextHead: Coord;
  aliveImmediate: boolean;
  survivesAfterFall: boolean;
  ateApple: boolean;
  selfCollisionRisk: number;
  enemyCollisionRisk: number;
  outOfBoundsRisk: number;
  supportStability: number;
  reachableSpace: number;
  headExposure: number;
  appleRaceMargin: number;
}

export function evaluateJointAction(
  state: RuntimeState,
  jointAction: JointAction,
  weights: CandidateWeights,
): EvaluationResult {
  const predictions = state.mySnakebots.map((snakebot) =>
    predictSnakebot(state, snakebot, jointAction.actions.find((action) => action.snakebotId === snakebot.id)?.direction),
  );

  const applesEaten = predictions.filter((prediction) => prediction.ateApple).length;
  const aliveImmediateCount = predictions.filter((prediction) => prediction.aliveImmediate).length;
  const aliveAfterFallCount = predictions.filter((prediction) => prediction.survivesAfterFall).length;

  const features: FeatureVector = {
    survivalImmediate: aliveImmediateCount / Math.max(predictions.length, 1),
    survivalAfterFall: aliveAfterFallCount / Math.max(predictions.length, 1),
    applesEaten,
    nearestAppleDistance: average(predictions.map((prediction) => nearestAppleDistance(prediction.nextHead, state.apples))),
    appleRaceMargin: average(predictions.map((prediction) => prediction.appleRaceMargin)),
    supportStability: average(predictions.map((prediction) => prediction.supportStability)),
    selfCollisionRisk: average(predictions.map((prediction) => prediction.selfCollisionRisk)),
    enemyCollisionRisk: average(predictions.map((prediction) => prediction.enemyCollisionRisk)),
    outOfBoundsRisk: average(predictions.map((prediction) => prediction.outOfBoundsRisk)),
    reachableSpace: average(predictions.map((prediction) => prediction.reachableSpace)),
    bodyCountDelta: (sum(state.mySnakebots.map((snakebot) => snakebot.length)) + applesEaten)
      - sum(state.opponentSnakebots.map((snakebot) => snakebot.length)),
    headExposure: average(predictions.map((prediction) => prediction.headExposure)),
  };

  let score = 0;
  for (const [key, value] of Object.entries(features) as Array<[keyof FeatureVector, number]>) {
    score += value * weights[key];
  }

  if (aliveImmediateCount < predictions.length) {
    score -= 1_000;
  }
  if (aliveAfterFallCount < predictions.length) {
    score -= 750;
  }

  return {
    jointAction,
    features,
    score,
  };
}

function predictSnakebot(
  state: RuntimeState,
  snakebot: Snakebot,
  direction = snakebot.facing,
): PredictedSnakebot {
  const nextHead = moveCoord(snakebot.head, direction);
  const occupiedBy = state.occupancy.get(coordKey(nextHead));
  const outOfBoundsRisk = inBounds(state, nextHead) ? 0 : 1;
  const wallCollision = inBounds(state, nextHead) && isWall(state, nextHead);
  const selfCollisionRisk = occupiedBy === snakebot.id ? 1 : 0;
  const enemyCollisionRisk = occupiedBy !== undefined && occupiedBy !== snakebot.id ? 1 : 0;
  const ateApple = state.appleSet.has(coordKey(nextHead));
  const aliveImmediate = outOfBoundsRisk === 0 && !wallCollision && selfCollisionRisk === 0 && enemyCollisionRisk === 0;
  const settledHead = aliveImmediate ? settleAfterFall(state, nextHead) : nextHead;
  const survivesAfterFall = aliveImmediate && inBounds(state, settledHead);
  const supportStability = survivesAfterFall && hasSupportBelow(state, settledHead) ? 1 : 0;
  const reachableSpace = survivesAfterFall ? floodFillSpace(state, settledHead, 12) : 0;
  const headExposure = survivesAfterFall ? countEnemyThreats(state, settledHead) : 1;
  const myDistance = nearestAppleDistance(settledHead, state.apples);
  const opponentDistance = nearestOpponentAppleDistance(state, settledHead);

  return {
    snakebotId: snakebot.id,
    nextHead: settledHead,
    aliveImmediate,
    survivesAfterFall,
    ateApple,
    selfCollisionRisk,
    enemyCollisionRisk,
    outOfBoundsRisk,
    supportStability,
    reachableSpace,
    headExposure,
    appleRaceMargin: opponentDistance - myDistance,
  };
}

function settleAfterFall(state: RuntimeState, start: Coord): Coord {
  let current = start;
  while (true) {
    const next = { x: current.x, y: current.y + 1 };
    if (!inBounds(state, next) || isSolid(state, next)) {
      return current;
    }
    current = next;
  }
}

function hasSupportBelow(state: RuntimeState, coord: Coord): boolean {
  const below = { x: coord.x, y: coord.y + 1 };
  return !inBounds(state, below) || isSolid(state, below);
}

function floodFillSpace(state: RuntimeState, start: Coord, maxCells: number): number {
  const visited = new Set<string>();
  const queue: Coord[] = [start];

  while (queue.length > 0 && visited.size < maxCells) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const key = coordKey(current);
    if (visited.has(key) || !inBounds(state, current) || isWall(state, current)) {
      continue;
    }

    visited.add(key);
    for (const next of neighbors(current)) {
      if (!visited.has(coordKey(next)) && !state.occupancy.has(coordKey(next))) {
        queue.push(next);
      }
    }
  }

  return visited.size;
}

function countEnemyThreats(state: RuntimeState, coord: Coord): number {
  return state.opponentSnakebots.filter((snakebot) => manhattanDistance(snakebot.head, coord) <= 2).length;
}

function nearestOpponentAppleDistance(state: RuntimeState, target: Coord): number {
  if (state.opponentSnakebots.length === 0 || state.apples.length === 0) {
    return 0;
  }

  const firstOpponent = state.opponentSnakebots[0];
  if (!firstOpponent) {
    return 0;
  }

  return Math.min(
    ...state.opponentSnakebots.map((snakebot) => nearestAppleDistance(snakebot.head, state.apples)),
    manhattanDistance(target, firstOpponent.head),
  );
}

function neighbors(coord: Coord): Coord[] {
  return [
    { x: coord.x + 1, y: coord.y },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x, y: coord.y - 1 },
  ];
}

function manhattanDistance(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
