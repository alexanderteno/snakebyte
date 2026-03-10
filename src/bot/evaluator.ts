import type { CandidateWeights } from "../ga/types.js";
import type { JointAction } from "./actions.js";
import type { Coord } from "./protocol.js";
import type { CandidateDebugRecord, FeatureContribution } from "./debug.js";
import {
  coordKey,
  isWall,
  moveCoord,
  nearestAppleDistance,
  type RuntimeState,
} from "./state.js";
import { OPPOSITE_DIRECTION, type Direction } from "./actions.js";
import { simulateTurn, type ResolvedTurn, type SimulatedState, type TurnEvent } from "./simulator.js";

export interface FeatureVector {
  /** Fraction of owned snakebots still alive immediately after collision/beheading resolution. Higher is better. */
  survivalImmediate: number;
  /** Fraction of owned snakebots still alive after all falling resolves. Higher is better. */
  survivalAfterFall: number;
  /** Number of apples eaten by owned snakebots during the simulated turn. Higher is better. */
  applesEaten: number;
  /** Mean Manhattan distance from owned heads to the nearest remaining apple after resolution. Lower is better. */
  nearestAppleDistance: number;
  /** Mean shortest-path distance from owned heads to the nearest reachable apple on the static post-turn board. Lower is better. */
  pathAppleDistance: number;
  /** Mean shortest legal turn count to any apple when movement and gravity are both simulated on the static post-turn board. Lower is better. */
  gravityAppleDistance: number;
  /** Opponent mean apple distance minus own mean apple distance after resolution. Higher means we lead the race. */
  appleRaceMargin: number;
  /** Sum of clipped per-apple distance advantages over the opponent across all remaining apples. Higher is better. */
  appleControl: number;
  /** Fraction of owned heads that are immediately supported from below after resolution. Higher is better. */
  supportStability: number;
  /** Change in support stability versus the pre-move state. Positive means the move gained support. */
  supportDelta: number;
  /** Count of owned beheading events caused by the move. Lower is better. */
  selfCollisionRisk: number;
  /** Count of opponent beheading events caused by the move. Higher is better. */
  enemyCollisionRisk: number;
  /** Count of owned out-of-bounds removals after falling. Lower is better. */
  outOfBoundsRisk: number;
  /** Total owned fall distance across all snakebots after the move. Lower is better. */
  fallDistance: number;
  /** Mean flood-filled open area from owned heads after resolution, capped to avoid runaway values. Higher is better. */
  reachableSpace: number;
  /** Smallest flood-filled open area among owned heads after resolution. Higher is better. */
  minReachableSpace: number;
  /** Confinement score from immediate and short-range mobility around owned heads. Lower is better. */
  escapePressure: number;
  /** Local contested-cell pressure from opponent heads that can reach nearby cells as fast or faster than we can. Lower is better. */
  headToHeadPressure: number;
  /** Near-head cells the opponent can claim strictly earlier than we can on the static post-turn board. Lower is better. */
  opponentFirstReach: number;
  /** Total owned body length minus opponent body length after resolution. Higher is better. */
  bodyCountDelta: number;
  /** Mean number of opponent heads within distance two of owned heads after resolution. Lower is better. */
  headExposure: number;
}

export interface EvaluationResult {
  jointAction: JointAction;
  features: FeatureVector;
  score: number;
  resolvedTurn: ResolvedTurn;
  debug: CandidateDebugRecord;
}

export function evaluateJointAction(
  state: RuntimeState,
  jointAction: JointAction,
  weights: CandidateWeights,
): EvaluationResult {
  const resolvedTurn = simulateTurn(state, jointAction);
  const features = extractFeatures(state, resolvedTurn);
  const contributions = buildContributions(features, weights);
  let score = sum(contributions.map((entry) => entry.contribution));

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
    debug: {
      jointAction: jointAction.actions.map((action) => `${action.snakebotId} ${action.direction}`).join(";") || "WAIT",
      score,
      features,
      contributions,
      events: resolvedTurn.events.map((event) => {
        return Object.assign(
          {
            snakebotId: event.snakebotId,
            owner: event.owner,
            kind: event.kind,
          },
          event.amount !== undefined ? { amount: event.amount } : {},
          event.coord ? { coord: { ...event.coord } } : {},
        ) satisfies CandidateDebugRecord["events"][number];
      }),
    },
  };
}

function extractFeatures(state: RuntimeState, resolvedTurn: ResolvedTurn): FeatureVector {
  const nextState = resolvedTurn.nextState;
  const ownedCount = Math.max(state.mySnakebots.length, 1);
  const searchLimit = nextState.width * nextState.height;
  const currentSupportStability = average(state.mySnakebots.map((snakebot) => hasSupportBelowRuntime(state, snakebot.head) ? 1 : 0));
  const supportStability = average(nextState.mySnakebots.map((snakebot) => hasSupportBelow(nextState, snakebot.head) ? 1 : 0));
  const nearestOwnAppleDistances = nextState.mySnakebots.map((snakebot) => nearestAppleDistance(snakebot.head, nextState.apples));
  const nearestOppAppleDistances = nextState.opponentSnakebots.map((snakebot) => nearestAppleDistance(snakebot.head, nextState.apples));
  const reachableSpaces = nextState.mySnakebots.map((snakebot) => floodFillSpace(nextState, snakebot.head, 40));
  const ownDistanceMaps = nextState.mySnakebots.map((snakebot) => buildDistanceMap(nextState, snakebot.head, searchLimit));
  const opponentDistanceMaps = nextState.opponentSnakebots.map((snakebot) => buildDistanceMap(nextState, snakebot.head, searchLimit));
  const pathAppleDistances = ownDistanceMaps.map((distanceMap) => nearestReachableAppleDistance(nextState, distanceMap));
  const gravityAppleDistances = nextState.mySnakebots.map((snakebot) => estimateGravityAppleDistance(nextState, snakebot, 6));
  const escapePressures = nextState.mySnakebots.map((snakebot, index) =>
    estimateEscapePressure(nextState, snakebot.head, ownDistanceMaps[index] ?? new Map<string, number>())
  );
  const headToHeadPressures = nextState.mySnakebots.map((snakebot, index) =>
    estimateHeadToHeadPressure(nextState, snakebot.head, ownDistanceMaps[index] ?? new Map<string, number>(), opponentDistanceMaps)
  );
  const opponentFirstReaches = nextState.mySnakebots.map((snakebot, index) =>
    estimateOpponentFirstReach(nextState, snakebot.head, ownDistanceMaps[index] ?? new Map<string, number>(), opponentDistanceMaps)
  );

  return {
    survivalImmediate: resolvedTurn.aliveAfterBeheadingIds.size / ownedCount,
    survivalAfterFall: nextState.mySnakebots.length / ownedCount,
    applesEaten: countEvents(resolvedTurn.events, "eat", "me"),
    nearestAppleDistance: average(nearestOwnAppleDistances),
    pathAppleDistance: average(pathAppleDistances),
    gravityAppleDistance: average(gravityAppleDistances),
    appleRaceMargin: average(nearestOppAppleDistances) - average(nearestOwnAppleDistances),
    appleControl: computeAppleControl(nextState),
    supportStability,
    supportDelta: supportStability - currentSupportStability,
    selfCollisionRisk: countEvents(resolvedTurn.events, "behead", "me"),
    enemyCollisionRisk: countEvents(resolvedTurn.events, "behead", "opponent"),
    outOfBoundsRisk: countEvents(resolvedTurn.events, "outOfBounds", "me"),
    fallDistance: totalEventAmount(resolvedTurn.events, "fall", "me"),
    reachableSpace: average(reachableSpaces),
    minReachableSpace: reachableSpaces.length > 0 ? Math.min(...reachableSpaces) : 0,
    escapePressure: average(escapePressures),
    headToHeadPressure: average(headToHeadPressures),
    opponentFirstReach: average(opponentFirstReaches),
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

function computeAppleControl(state: SimulatedState): number {
  if (state.apples.length === 0) {
    return 0;
  }

  return sum(state.apples.map((apple) => {
    const ownDistance = nearestHeadDistance(state.mySnakebots.map((snakebot) => snakebot.head), apple);
    const opponentDistance = nearestHeadDistance(state.opponentSnakebots.map((snakebot) => snakebot.head), apple);
    return clamp(opponentDistance - ownDistance, -5, 5);
  }));
}

function estimateEscapePressure(state: SimulatedState, head: Coord, distanceMap: Map<string, number>): number {
  const immediateEscapes = countImmediateEscapes(state, head);
  const shortRangeMobility = countShortRangeMobility(state, head, distanceMap, 2);
  return (4 - immediateEscapes) + Math.max(0, 6 - shortRangeMobility);
}

function estimateHeadToHeadPressure(
  state: SimulatedState,
  head: Coord,
  ownDistanceMap: Map<string, number>,
  opponentDistanceMaps: Map<string, number>[],
): number {
  const radius = 3;
  let pressure = 0;

  for (const [key, ownDistance] of ownDistanceMap.entries()) {
    if (ownDistance <= 0 || ownDistance > radius) {
      continue;
    }

    const cell = parseCoordKey(key);
    if (!cell || !isTraversable(state, cell)) {
      continue;
    }

    const nearestOpponentDistance = nearestMappedDistance(opponentDistanceMaps, key);
    if (nearestOpponentDistance === null || nearestOpponentDistance > ownDistance) {
      continue;
    }

    const urgency = (radius + 1) - ownDistance;
    const contestSeverity = (ownDistance - nearestOpponentDistance) + 2;
    pressure += urgency * contestSeverity;
  }

  return pressure;
}

function estimateOpponentFirstReach(
  state: SimulatedState,
  head: Coord,
  ownDistanceMap: Map<string, number>,
  opponentDistanceMaps: Map<string, number>[],
): number {
  const radius = 4;
  let pressure = 0;

  for (const [key, ownDistance] of ownDistanceMap.entries()) {
    if (ownDistance <= 0 || ownDistance > radius) {
      continue;
    }

    const cell = parseCoordKey(key);
    if (!cell || !isTraversable(state, cell)) {
      continue;
    }

    const nearestOpponentDistance = nearestMappedDistance(opponentDistanceMaps, key);
    if (nearestOpponentDistance === null || nearestOpponentDistance >= ownDistance) {
      continue;
    }

    const urgency = (radius + 1) - ownDistance;
    const lead = ownDistance - nearestOpponentDistance;
    const localLaneBias = Math.max(0, 3 - manhattanDistance(head, cell));
    pressure += urgency * (lead + localLaneBias);
  }

  return pressure;
}

function buildDistanceMap(state: SimulatedState, start: Coord, maxDistance: number): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: Array<{ coord: Coord; distance: number }> = [{ coord: start, distance: 0 }];
  distances.set(coordKey(start), 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.distance >= maxDistance) {
      continue;
    }

    for (const next of neighbors(current.coord)) {
      const key = coordKey(next);
      if (distances.has(key) || !isTraversable(state, next)) {
        continue;
      }
      distances.set(key, current.distance + 1);
      queue.push({ coord: next, distance: current.distance + 1 });
    }
  }

  return distances;
}

function nearestReachableAppleDistance(state: SimulatedState, distanceMap: Map<string, number>): number {
  const fallback = state.width + state.height + 10;
  let best = Number.POSITIVE_INFINITY;

  for (const apple of state.apples) {
    const distance = distanceMap.get(coordKey(apple));
    if (distance !== undefined) {
      best = Math.min(best, distance);
    }
  }

  return Number.isFinite(best) ? best : fallback;
}

function estimateGravityAppleDistance(state: SimulatedState, snakebot: SimulatedState["mySnakebots"][number], maxDepth: number): number {
  const fallback = state.width + state.height + 10;
  if (state.apples.length === 0) {
    return 0;
  }

  const blockedByOthers = new Set<string>();
  for (const otherSnakebot of [...state.mySnakebots, ...state.opponentSnakebots]) {
    if (otherSnakebot.id === snakebot.id) {
      continue;
    }
    for (const coord of otherSnakebot.body) {
      blockedByOthers.add(coordKey(coord));
    }
  }

  const initialNode: GravitySearchNode = {
    body: snakebot.body.map((coord) => ({ ...coord })),
    head: { ...snakebot.head },
    facing: snakebot.facing,
    turns: 0,
  };
  const queue: GravitySearchNode[] = [initialNode];
  const visited = new Set([serializeGravityNode(initialNode)]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.turns >= maxDepth) {
      continue;
    }

    for (const direction of legalGravityDirections(current.facing)) {
      const next = applyGravityPathStep(state, current, direction, blockedByOthers);
      if (!next) {
        continue;
      }
      if (next.ateApple) {
        return next.turns;
      }

      const key = serializeGravityNode(next);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }

  return fallback;
}

interface GravitySearchNode {
  body: Coord[];
  head: Coord;
  facing: Direction;
  turns: number;
  ateApple?: boolean;
}

function legalGravityDirections(facing: Direction): Direction[] {
  return ["UP", "DOWN", "LEFT", "RIGHT"].filter((direction): direction is Direction => direction !== OPPOSITE_DIRECTION[facing]);
}

function applyGravityPathStep(
  state: SimulatedState,
  node: GravitySearchNode,
  direction: Direction,
  blockedByOthers: Set<string>,
): GravitySearchNode | null {
  const apples = state.apples.map((apple) => ({ ...apple }));
  const target = moveCoord(node.head, direction);

  if (!inBoundsState(state, target) || isWallState(state, target)) {
    return null;
  }

  const ateApple = apples.some((apple) => coordsEqual(apple, target));
  const nextBody = [target, ...node.body.map((coord) => ({ ...coord }))];
  if (!ateApple) {
    nextBody.pop();
  }

  if (hasBodyCollision(nextBody) || blockedByOthers.has(coordKey(target))) {
    return null;
  }

  const remainingApples = ateApple
    ? apples.filter((apple) => !coordsEqual(apple, target))
    : apples;
  const settledBody = settleGravityBody(nextBody, remainingApples, blockedByOthers, state);
  if (!settledBody) {
    return null;
  }

  return {
    body: settledBody,
    head: settledBody[0] ?? target,
    facing: direction,
    turns: node.turns + 1,
    ateApple,
  };
}

function settleGravityBody(
  body: Coord[],
  apples: Coord[],
  blockedByOthers: Set<string>,
  state: SimulatedState,
): Coord[] | null {
  let settled = body.map((coord) => ({ ...coord }));

  while (canBodyFall(settled, apples, blockedByOthers, state)) {
    settled = settled.map((coord) => ({ x: coord.x, y: coord.y + 1 }));
    if (settled.every((coord) => coord.y >= state.height + 1)) {
      return null;
    }
  }

  return settled;
}

function canBodyFall(
  body: Coord[],
  apples: Coord[],
  blockedByOthers: Set<string>,
  state: SimulatedState,
): boolean {
  return body.every((coord) => !hasSupportUnder(coord, body, apples, blockedByOthers, state));
}

function hasSupportUnder(
  coord: Coord,
  body: Coord[],
  apples: Coord[],
  blockedByOthers: Set<string>,
  state: SimulatedState,
): boolean {
  const below = { x: coord.x, y: coord.y + 1 };
  if (body.some((entry) => coordsEqual(entry, below))) {
    return true;
  }
  if (!inBoundsState(state, below) || isWallState(state, below)) {
    return true;
  }
  if (blockedByOthers.has(coordKey(below))) {
    return true;
  }
  return apples.some((apple) => coordsEqual(apple, below));
}

function hasBodyCollision(body: Coord[]): boolean {
  const seen = new Set<string>();
  for (const coord of body) {
    const key = coordKey(coord);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

function serializeGravityNode(node: GravitySearchNode): string {
  return `${node.facing}|${node.body.map(coordKey).join(":")}`;
}

function coordsEqual(left: Coord, right: Coord): boolean {
  return left.x === right.x && left.y === right.y;
}

function countImmediateEscapes(state: SimulatedState, head: Coord): number {
  return neighbors(head).filter((coord) => isTraversable(state, coord)).length;
}

function countShortRangeMobility(
  _state: SimulatedState,
  _start: Coord,
  distanceMap: Map<string, number>,
  depthLimit: number,
): number {
  return [...distanceMap.values()].filter((distance) => distance > 0 && distance <= depthLimit).length;
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

function nearestHeadDistance(heads: Coord[], target: Coord): number {
  if (heads.length === 0) {
    return 99;
  }

  return heads.reduce((best, head) => Math.min(best, manhattanDistance(head, target)), Number.POSITIVE_INFINITY);
}

function nearestMappedDistance(distanceMaps: Map<string, number>[], key: string): number | null {
  let best = Number.POSITIVE_INFINITY;

  for (const distanceMap of distanceMaps) {
    const distance = distanceMap.get(key);
    if (distance !== undefined) {
      best = Math.min(best, distance);
    }
  }

  return Number.isFinite(best) ? best : null;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseCoordKey(key: string): Coord | null {
  const [xToken, yToken] = key.split(",");
  const x = Number(xToken);
  const y = Number(yToken);

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return null;
  }

  return { x, y };
}

function buildContributions(features: FeatureVector, weights: CandidateWeights): FeatureContribution[] {
  return (Object.entries(features) as Array<[keyof FeatureVector, number]>).map(([name, value]) => ({
    name,
    value,
    weight: weights[name],
    contribution: value * weights[name],
  }));
}

function countEvents(events: TurnEvent[], kind: TurnEvent["kind"], owner: TurnEvent["owner"]): number {
  return events.filter((event) => event.kind === kind && event.owner === owner).length;
}

function totalEventAmount(events: TurnEvent[], kind: TurnEvent["kind"], owner: TurnEvent["owner"]): number {
  return events
    .filter((event) => event.kind === kind && event.owner === owner)
    .reduce((total, event) => total + (event.amount ?? 0), 0);
}

function inBoundsState(state: SimulatedState, coord: Coord): boolean {
  return coord.x >= 0 && coord.x < state.width && coord.y >= 0 && coord.y < state.height;
}

function isWallState(state: SimulatedState, coord: Coord): boolean {
  return state.rows[coord.y]?.[coord.x] === "#";
}

function isTraversable(state: SimulatedState, coord: Coord): boolean {
  return inBoundsState(state, coord)
    && !isWallState(state, coord)
    && !state.occupancy.has(coordKey(coord));
}

function hasSupportBelow(state: SimulatedState, coord: Coord): boolean {
  const below = { x: coord.x, y: coord.y + 1 };
  return !inBoundsState(state, below)
    || state.rows[below.y]?.[below.x] === "#"
    || state.apples.some((apple) => apple.x === below.x && apple.y === below.y)
    || state.occupancy.has(coordKey(below));
}

function hasSupportBelowRuntime(state: RuntimeState, coord: Coord): boolean {
  const below = { x: coord.x, y: coord.y + 1 };
  return below.y >= state.height
    || isWall(state, below)
    || state.appleSet.has(coordKey(below))
    || state.occupancy.has(coordKey(below));
}
