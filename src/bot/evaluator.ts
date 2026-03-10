import type { CandidateWeights } from "../ga/types.js";
import type { JointAction } from "./actions.js";
import type { Coord } from "./protocol.js";
import {
  coordKey,
  isWall,
  nearestAppleDistance,
  type RuntimeState,
} from "./state.js";
import { simulateTurn, type ResolvedTurn, type SimulatedState, type TurnEvent } from "./simulator.js";

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
  resolvedTurn: ResolvedTurn;
}

export function evaluateJointAction(
  state: RuntimeState,
  jointAction: JointAction,
  weights: CandidateWeights,
): EvaluationResult {
  const resolvedTurn = simulateTurn(state, jointAction);
  const features = extractFeatures(state, resolvedTurn);

  let score = 0;
  for (const [key, value] of Object.entries(features) as Array<[keyof FeatureVector, number]>) {
    score += value * weights[key];
  }

  if (features.survivalImmediate < 1) {
    score -= 1_000;
  }
  if (features.survivalAfterFall < 1) {
    score -= 750;
  }

  return {
    jointAction,
    features,
    score,
    resolvedTurn,
  };
}

function extractFeatures(state: RuntimeState, resolvedTurn: ResolvedTurn): FeatureVector {
  const nextState = resolvedTurn.nextState;
  const ownedCount = Math.max(state.mySnakebots.length, 1);
  const supportStability = average(nextState.mySnakebots.map((snakebot) => hasSupportBelow(nextState, snakebot.head) ? 1 : 0));
  const nearestOwnAppleDistances = nextState.mySnakebots.map((snakebot) => nearestAppleDistance(snakebot.head, nextState.apples));
  const nearestOppAppleDistances = nextState.opponentSnakebots.map((snakebot) => nearestAppleDistance(snakebot.head, nextState.apples));

  return {
    survivalImmediate: resolvedTurn.aliveAfterBeheadingIds.size / ownedCount,
    survivalAfterFall: nextState.mySnakebots.length / ownedCount,
    applesEaten: countEvents(resolvedTurn.events, "eat", "me"),
    nearestAppleDistance: average(nearestOwnAppleDistances),
    appleRaceMargin: average(nearestOppAppleDistances) - average(nearestOwnAppleDistances),
    supportStability,
    selfCollisionRisk: countEvents(resolvedTurn.events, "behead", "me"),
    enemyCollisionRisk: countEvents(resolvedTurn.events, "behead", "opponent"),
    outOfBoundsRisk: countEvents(resolvedTurn.events, "outOfBounds", "me"),
    reachableSpace: average(nextState.mySnakebots.map((snakebot) => floodFillSpace(nextState, snakebot.head, 20))),
    bodyCountDelta: sum(nextState.mySnakebots.map((snakebot) => snakebot.body.length))
      - sum(nextState.opponentSnakebots.map((snakebot) => snakebot.body.length)),
    headExposure: average(nextState.mySnakebots.map((snakebot) => countEnemyThreats(nextState, snakebot.head))),
  };
}

function floodFillSpace(state: SimulatedState, start: Coord, maxCells: number): number {
  const visited = new Set<string>();
  const queue: Coord[] = [start];

  while (queue.length > 0 && visited.size < maxCells) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const key = coordKey(current);
    if (visited.has(key) || !inBoundsState(state, current) || isWallState(state, current)) {
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

function countEnemyThreats(state: SimulatedState, coord: Coord): number {
  return state.opponentSnakebots.filter((snakebot) => manhattanDistance(snakebot.head, coord) <= 2).length;
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

function countEvents(events: TurnEvent[], kind: TurnEvent["kind"], owner: TurnEvent["owner"]): number {
  return events.filter((event) => event.kind === kind && event.owner === owner).length;
}

function inBoundsState(state: SimulatedState, coord: Coord): boolean {
  return coord.x >= 0 && coord.x < state.width && coord.y >= 0 && coord.y < state.height;
}

function isWallState(state: SimulatedState, coord: Coord): boolean {
  return state.rows[coord.y]?.[coord.x] === "#";
}

function hasSupportBelow(state: SimulatedState, coord: Coord): boolean {
  const below = { x: coord.x, y: coord.y + 1 };
  return !inBoundsState(state, below)
    || state.rows[below.y]?.[below.x] === "#"
    || state.apples.some((apple) => apple.x === below.x && apple.y === below.y)
    || state.occupancy.has(coordKey(below));
}
