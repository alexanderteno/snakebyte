import type { CandidateWeights } from "../ga/types.js";
import type { JointAction } from "./actions.js";
import type { TurnDeadline } from "./deadline.js";
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
import { recordCounter, recordTiming, timeSection } from "./perf.js";
import { resolveGravitySearchPlan } from "./gravity-plan.js";

export interface FeatureVector {
  /** Fraction of owned snakebots still alive immediately after collision/beheading resolution. Higher is better. */
  survivalImmediate: number;
  /** Fraction of owned snakebots still alive after all falling resolves. Higher is better. */
  survivalAfterFall: number;
  /** Number of apples eaten by owned snakebots during the simulated turn. Higher is better. */
  applesEaten: number;
  /** Count of apples that remained adjacent to the same owned head across the turn while uncontested by opponents. Lower is better. */
  adjacentAppleStall: number;
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
  /** Short-horizon lane overlap and crowding among owned heads after resolution. Lower is better. */
  friendlyHeadPressure: number;
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
  usedFeatureApproximation: boolean;
}

export function evaluateJointAction(
  state: RuntimeState,
  jointAction: JointAction,
  weights: CandidateWeights,
  deadline?: TurnDeadline,
): EvaluationResult | null {
  if (deadline?.shouldStop()) {
    return null;
  }
  recordCounter("evaluate_joint_action_calls");
  const startedAt = nowMs();
  const resolvedTurn = simulateTurn(state, jointAction);
  const { features, usedFallback } = extractFeatures(state, resolvedTurn, deadline);
  let score = 0;
  let contributions: FeatureContribution[] = [];
  for (const [name, value] of Object.entries(features) as Array<[keyof FeatureVector, number]>) {
    score += value * weights[name];
  }

  if (features.survivalImmediate < 1) {
    score -= 1_000;
  }
  if (features.survivalAfterFall < 1) {
    score -= 750;
  }

  if (shouldBuildDetailedDebug()) {
    contributions = buildContributions(features, weights);
  }

  const result: EvaluationResult = {
    jointAction,
    features,
    score,
    resolvedTurn,
    debug: {
      jointAction: jointAction.actions.map((action) => `${action.snakebotId} ${action.direction}`).join(";") || "WAIT",
      score,
      features,
      contributions,
      events: shouldBuildDetailedDebug()
        ? resolvedTurn.events.map((event) => {
          return Object.assign(
            {
              snakebotId: event.snakebotId,
              owner: event.owner,
              kind: event.kind,
            },
            event.amount !== undefined ? { amount: event.amount } : {},
            event.coord ? { coord: { ...event.coord } } : {},
          ) satisfies CandidateDebugRecord["events"][number];
        })
        : [],
    },
    usedFeatureApproximation: usedFallback,
  };

  recordTiming("evaluateJointAction", nowMs() - startedAt);
  return result;
}

function extractFeatures(
  state: RuntimeState,
  resolvedTurn: ResolvedTurn,
  deadline?: TurnDeadline,
): { features: FeatureVector; usedFallback: boolean } {
  return timeSection("extractFeatures", () => {
    const nextState = resolvedTurn.nextState;
    const ownedCount = Math.max(state.mySnakebots.length, 1);
    const searchLimit = nextState.width * nextState.height;
    let usedFallback = false;
    const currentSupportStability = average(state.mySnakebots.map((snakebot) => hasSupportBelowRuntime(state, snakebot.head, snakebot.id) ? 1 : 0));
    const supportStability = average(nextState.mySnakebots.map((snakebot) => hasSupportBelow(nextState, snakebot.head, snakebot.id) ? 1 : 0));
    const opponentHeads = nextState.opponentSnakebots.map((snakebot) => snakebot.head);
    const nearestOwnAppleDistances = nextState.mySnakebots.map((snakebot) => nearestAppleDistance(snakebot.head, nextState.apples));
    const nearestOppAppleDistances = nextState.opponentSnakebots.map((snakebot) => nearestAppleDistance(snakebot.head, nextState.apples));
    const ownReachability = nextState.mySnakebots.map((snakebot) => analyzeReachability(nextState, snakebot.head, searchLimit, 40));
    const reachableSpaces = ownReachability.map((entry) => entry.reachableSpace);
    const ownDistanceMaps = ownReachability.map((entry) => entry.distanceMap);
    const opponentDistanceMaps = nextState.opponentSnakebots.map((snakebot) => buildDistanceMap(nextState, snakebot.head, searchLimit));
    const pathAppleDistances = ownDistanceMaps.map((distanceMap) => nearestReachableAppleDistance(nextState, distanceMap));
    const gravitySearchPlan = resolveGravitySearchPlan(
      nextState.mySnakebots.map((snakebot, index) => ({
        nearestAppleDistance: nearestOwnAppleDistances[index] ?? gravityAppleFallback(nextState),
        pathAppleDistance: pathAppleDistances[index] ?? gravityAppleFallback(nextState),
        supported: hasSupportBelow(nextState, snakebot.head, snakebot.id),
      })),
      deadline,
    );
    const gravityAppleDistances = nextState.mySnakebots.map((snakebot, index) => {
      const plan = gravitySearchPlan[index];
      if (!plan) {
        usedFallback = true;
        recordCounter("fallback_feature_count");
        return gravityAppleFallback(nextState);
      }

      if (!plan.shouldSearch || deadline?.shouldSkipDeepWork()) {
        usedFallback = true;
        recordCounter("fallback_feature_count");
        recordCounter("gravity_search_approximations");
        return plan.approximateDistance;
      }

      const gravityResult = estimateGravityAppleDistance(nextState, snakebot, plan.depth, deadline);
      if (gravityResult.usedFallback) {
        usedFallback = true;
        recordCounter("fallback_feature_count");
      }
      return gravityResult.distance;
    });
    const escapePressures = nextState.mySnakebots.map((snakebot, index) =>
      estimateEscapePressure(nextState, snakebot.head, ownDistanceMaps[index] ?? new Map<string, number>())
    );
    const headToHeadPressures = nextState.mySnakebots.map((snakebot, index) =>
      estimateHeadToHeadPressure(nextState, snakebot.head, ownDistanceMaps[index] ?? new Map<string, number>(), opponentDistanceMaps)
    );
    const opponentFirstReaches = nextState.mySnakebots.map((snakebot, index) =>
      estimateOpponentFirstReach(nextState, snakebot.head, ownDistanceMaps[index] ?? new Map<string, number>(), opponentDistanceMaps)
    );
    const friendlyHeadPressure = estimateFriendlyHeadPressure(nextState, ownDistanceMaps);

    return {
      features: {
        survivalImmediate: resolvedTurn.aliveAfterBeheadingIds.size / ownedCount,
        survivalAfterFall: nextState.mySnakebots.length / ownedCount,
        applesEaten: countEvents(resolvedTurn.events, "eat", "me"),
        adjacentAppleStall: estimateAdjacentAppleStall(state, nextState, resolvedTurn, opponentHeads),
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
        friendlyHeadPressure,
        bodyCountDelta: sum(nextState.mySnakebots.map((snakebot) => snakebot.body.length))
          - sum(nextState.opponentSnakebots.map((snakebot) => snakebot.body.length)),
        headExposure: average(nextState.mySnakebots.map((snakebot) => countEnemyThreats(nextState, snakebot.head))),
      },
      usedFallback,
    };
  });
}

function estimateAdjacentAppleStall(
  state: RuntimeState,
  nextState: SimulatedState,
  resolvedTurn: ResolvedTurn,
  opponentHeads: Coord[],
): number {
  const applesEatenById = new Set<number>();
  for (const event of resolvedTurn.events) {
    if (event.kind === "eat" && event.owner === "me") {
      applesEatenById.add(event.snakebotId);
    }
  }
  const previousHeadsById = new Map(state.mySnakebots.map((snakebot) => [snakebot.id, snakebot.head]));
  let stallCount = 0;

  for (const snakebot of nextState.mySnakebots) {
    if (applesEatenById.has(snakebot.id)) {
      continue;
    }

    const previousHead = previousHeadsById.get(snakebot.id);
    if (!previousHead) {
      continue;
    }

    for (const apple of nextState.apples) {
      if (manhattanDistance(previousHead, apple) !== 1 || manhattanDistance(snakebot.head, apple) !== 1) {
        continue;
      }
      if (nearestHeadDistance(opponentHeads, apple) <= 1) {
        continue;
      }
      stallCount += 1;
      break;
    }
  }

  return stallCount;
}

function analyzeReachability(
  state: SimulatedState,
  start: Coord,
  maxDistance: number,
  reachableCap: number,
): { distanceMap: Map<string, number>; reachableSpace: number } {
  const distanceMap = new Map<string, number>();
  const queue: Array<{ coord: Coord; distance: number }> = [{ coord: start, distance: 0 }];
  let queueIndex = 0;
  distanceMap.set(coordKey(start), 0);

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    if (!current || current.distance >= maxDistance) {
      continue;
    }

    for (const next of neighbors(current.coord)) {
      const key = coordKey(next);
      if (distanceMap.has(key) || !isTraversable(state, next)) {
        continue;
      }
      distanceMap.set(key, current.distance + 1);
      queue.push({ coord: next, distance: current.distance + 1 });
    }
  }

  return {
    distanceMap,
    reachableSpace: Math.min(reachableCap, distanceMap.size),
  };
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

function estimateFriendlyHeadPressure(
  state: SimulatedState,
  ownDistanceMaps: Map<string, number>[],
): number {
  let pressure = 0;

  for (let leftIndex = 0; leftIndex < state.mySnakebots.length; leftIndex += 1) {
    const leftSnakebot = state.mySnakebots[leftIndex];
    if (!leftSnakebot) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < state.mySnakebots.length; rightIndex += 1) {
      const rightSnakebot = state.mySnakebots[rightIndex];
      if (!rightSnakebot) {
        continue;
      }

      const headDistance = manhattanDistance(leftSnakebot.head, rightSnakebot.head);
      if (headDistance <= 2) {
        pressure += (3 - headDistance) * 3;
      }

      const leftMap = ownDistanceMaps[leftIndex] ?? new Map<string, number>();
      const rightMap = ownDistanceMaps[rightIndex] ?? new Map<string, number>();
      pressure += sharedLanePressure(leftMap, rightMap);
    }
  }

  return pressure;
}

function sharedLanePressure(
  leftMap: Map<string, number>,
  rightMap: Map<string, number>,
): number {
  let overlap = 0;

  for (const [key, leftDistance] of leftMap.entries()) {
    if (leftDistance <= 0 || leftDistance > 2) {
      continue;
    }

    const rightDistance = rightMap.get(key);
    if (rightDistance === undefined || rightDistance <= 0 || rightDistance > 2) {
      continue;
    }

    const urgency = 5 - (leftDistance + rightDistance);
    overlap += Math.max(1, urgency);
  }

  return overlap;
}

function buildDistanceMap(state: SimulatedState, start: Coord, maxDistance: number): Map<string, number> {
  return analyzeReachability(state, start, maxDistance, Number.MAX_SAFE_INTEGER).distanceMap;
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

function estimateGravityAppleDistance(
  state: SimulatedState,
  snakebot: SimulatedState["mySnakebots"][number],
  maxDepth: number,
  deadline?: TurnDeadline,
): { distance: number; usedFallback: boolean } {
  const startedAt = nowMs();
  const fallback = gravityAppleFallback(state);
  if (state.apples.length === 0) {
    return { distance: 0, usedFallback: false };
  }

  const appleKeys = new Set<string>();
  for (const apple of state.apples) {
    appleKeys.add(coordKey(apple));
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
  let queueIndex = 0;
  const visited = new Set([serializeGravityNode(initialNode)]);

  while (queueIndex < queue.length) {
    if (deadline?.shouldSkipDeepWork()) {
      recordCounter("gravity_search_interrupts");
      recordTiming("gravityAppleDistance", nowMs() - startedAt);
      return { distance: fallback, usedFallback: true };
    }
    const current = queue[queueIndex];
    queueIndex += 1;
    if (!current) {
      continue;
    }
    recordCounter("gravity_search_nodes");

    if (current.turns >= maxDepth) {
      continue;
    }

    for (const direction of legalGravityDirections(current.facing)) {
      const next = applyGravityPathStep(state, current, direction, blockedByOthers, appleKeys);
      if (!next) {
        continue;
      }
      if (next.ateApple) {
        recordTiming("gravityAppleDistance", nowMs() - startedAt);
        return { distance: next.turns, usedFallback: false };
      }

      const key = serializeGravityNode(next);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }

  recordTiming("gravityAppleDistance", nowMs() - startedAt);
  return { distance: fallback, usedFallback: false };
}

interface GravitySearchNode {
  body: Coord[];
  head: Coord;
  facing: Direction;
  turns: number;
  ateApple?: boolean;
  consumedAppleKey?: string;
}

const LEGAL_GRAVITY_DIRECTIONS: Record<Direction, Direction[]> = {
  UP: ["UP", "LEFT", "RIGHT"],
  DOWN: ["DOWN", "LEFT", "RIGHT"],
  LEFT: ["UP", "DOWN", "LEFT"],
  RIGHT: ["UP", "DOWN", "RIGHT"],
};

function legalGravityDirections(facing: Direction): Direction[] {
  return LEGAL_GRAVITY_DIRECTIONS[facing];
}

function applyGravityPathStep(
  state: SimulatedState,
  node: GravitySearchNode,
  direction: Direction,
  blockedByOthers: Set<string>,
  appleKeys: Set<string>,
): GravitySearchNode | null {
  const target = moveCoord(node.head, direction);

  if (!inBoundsState(state, target) || isWallState(state, target)) {
    return null;
  }

  const targetKey = coordKey(target);
  const ateApple = appleKeys.has(targetKey);
  const nextBody = [target, ...node.body];
  if (!ateApple) {
    nextBody.pop();
  }

  if (hasBodyCollision(nextBody) || blockedByOthers.has(targetKey)) {
    return null;
  }

  const settledBody = settleGravityBody(nextBody, appleKeys, blockedByOthers, state, ateApple ? targetKey : undefined);
  if (!settledBody) {
    return null;
  }

  return {
    body: settledBody,
    head: settledBody[0] ?? target,
    facing: direction,
    turns: node.turns + 1,
    ateApple,
    ...(ateApple ? { consumedAppleKey: targetKey } : {}),
  };
}

function settleGravityBody(
  body: Coord[],
  appleKeys: Set<string>,
  blockedByOthers: Set<string>,
  state: SimulatedState,
  consumedAppleKey?: string,
): Coord[] | null {
  let settled = body;

  while (canBodyFall(settled, appleKeys, blockedByOthers, state, consumedAppleKey)) {
    settled = settled.map((coord) => ({ x: coord.x, y: coord.y + 1 }));
    if (settled.every((coord) => coord.y >= state.height + 1)) {
      return null;
    }
  }

  return settled;
}

function canBodyFall(
  body: Coord[],
  appleKeys: Set<string>,
  blockedByOthers: Set<string>,
  state: SimulatedState,
  consumedAppleKey?: string,
): boolean {
  return body.every((coord) => !hasSupportUnder(coord, appleKeys, blockedByOthers, state, consumedAppleKey));
}

function hasSupportUnder(
  coord: Coord,
  appleKeys: Set<string>,
  blockedByOthers: Set<string>,
  state: SimulatedState,
  consumedAppleKey?: string,
): boolean {
  const below = { x: coord.x, y: coord.y + 1 };
  if (!inBoundsState(state, below) || isWallState(state, below)) {
    return true;
  }
  if (blockedByOthers.has(coordKey(below))) {
    return true;
  }
  const belowKey = coordKey(below);
  return belowKey !== consumedAppleKey && appleKeys.has(belowKey);
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
  let serialized = `${node.facing}|`;
  for (let index = 0; index < node.body.length; index += 1) {
    if (index > 0) {
      serialized += ":";
    }
    serialized += coordKey(node.body[index]!);
  }
  return serialized;
}

function gravityAppleFallback(state: SimulatedState): number {
  return state.width + state.height + 10;
}

function coordsEqual(left: Coord, right: Coord): boolean {
  return left.x === right.x && left.y === right.y;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function countImmediateEscapes(state: SimulatedState, head: Coord): number {
  let escapes = 0;
  for (const coord of neighbors(head)) {
    if (isTraversable(state, coord)) {
      escapes += 1;
    }
  }
  return escapes;
}

function countShortRangeMobility(
  _state: SimulatedState,
  _start: Coord,
  distanceMap: Map<string, number>,
  depthLimit: number,
): number {
  let mobility = 0;
  for (const distance of distanceMap.values()) {
    if (distance > 0 && distance <= depthLimit) {
      mobility += 1;
    }
  }
  return mobility;
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

function shouldBuildDetailedDebug(): boolean {
  return Boolean(process.env.SNAKEBYTE_DEBUG_CANDIDATES || process.env.SNAKEBYTE_DIAGNOSTICS_FILE);
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

function hasSupportBelow(state: SimulatedState, coord: Coord, snakebotId: number): boolean {
  const below = { x: coord.x, y: coord.y + 1 };
  return !inBoundsState(state, below)
    || state.rows[below.y]?.[below.x] === "#"
    || state.apples.some((apple) => apple.x === below.x && apple.y === below.y)
    || ((state.occupancy.get(coordKey(below)) ?? snakebotId) !== snakebotId);
}

function hasSupportBelowRuntime(state: RuntimeState, coord: Coord, snakebotId: number): boolean {
  const below = { x: coord.x, y: coord.y + 1 };
  return below.y >= state.height
    || isWall(state, below)
    || state.appleSet.has(coordKey(below))
    || ((state.occupancy.get(coordKey(below)) ?? snakebotId) !== snakebotId);
}
