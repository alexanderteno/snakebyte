import type { ExperimentConfig } from "../config.js";
import type { Direction } from "./actions.js";
import { OPPOSITE_DIRECTION } from "./actions.js";
import type { Coord, FrameState, GlobalState, BirdState } from "./protocol.js";

export interface Snakebot extends BirdState {
  head: Coord;
  length: number;
  facing: Direction;
}

export interface CellInfo {
  wall: boolean;
  apple: boolean;
  occupiedBy?: number;
}

export interface RuntimeState {
  global: GlobalState;
  frame: FrameState;
  width: number;
  height: number;
  apples: Coord[];
  mySnakebots: Snakebot[];
  opponentSnakebots: Snakebot[];
  occupancy: Map<string, number>;
  appleSet: Set<string>;
  config: Pick<ExperimentConfig, "maxCandidateMovesPerSnakebot" | "maxJointActions">;
}

export function createRuntimeState(
  globalState: GlobalState,
  frameState: FrameState,
  config: Pick<ExperimentConfig, "maxCandidateMovesPerSnakebot" | "maxJointActions">,
): RuntimeState {
  const occupancy = new Map<string, number>();
  for (const bird of frameState.birds) {
    for (const coord of bird.body) {
      occupancy.set(coordKey(coord), bird.id);
    }
  }

  const appleSet = new Set(frameState.apples.map(coordKey));
  const mySnakebots = frameState.birds
    .filter((bird) => globalState.myBirdIds.includes(bird.id))
    .map(toSnakebot);
  const opponentSnakebots = frameState.birds
    .filter((bird) => globalState.opponentBirdIds.includes(bird.id))
    .map(toSnakebot);

  return {
    global: globalState,
    frame: frameState,
    width: globalState.width,
    height: globalState.height,
    apples: frameState.apples,
    mySnakebots,
    opponentSnakebots,
    occupancy,
    appleSet,
    config,
  };
}

export function coordKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

export function inBounds(state: RuntimeState, coord: Coord): boolean {
  return coord.x >= 0 && coord.x < state.width && coord.y >= 0 && coord.y < state.height;
}

export function isWall(state: RuntimeState, coord: Coord): boolean {
  return state.global.rows[coord.y]?.[coord.x] === "#";
}

export function isSolid(state: RuntimeState, coord: Coord): boolean {
  return isWall(state, coord) || state.appleSet.has(coordKey(coord)) || state.occupancy.has(coordKey(coord));
}

export function moveCoord(coord: Coord, direction: Direction): Coord {
  switch (direction) {
    case "UP":
      return { x: coord.x, y: coord.y - 1 };
    case "DOWN":
      return { x: coord.x, y: coord.y + 1 };
    case "LEFT":
      return { x: coord.x - 1, y: coord.y };
    case "RIGHT":
      return { x: coord.x + 1, y: coord.y };
  }
}

export function turnIsLegal(snakebot: Snakebot, direction: Direction): boolean {
  return OPPOSITE_DIRECTION[snakebot.facing] !== direction;
}

export function nearestAppleDistance(head: Coord, apples: Coord[]): number {
  if (apples.length === 0) {
    return 0;
  }

  return apples.reduce(
    (best, apple) => Math.min(best, Math.abs(head.x - apple.x) + Math.abs(head.y - apple.y)),
    Number.POSITIVE_INFINITY,
  );
}

function toSnakebot(bird: BirdState): Snakebot {
  return {
    ...bird,
    head: bird.body[0] ?? { x: 0, y: 0 },
    length: bird.body.length,
    facing: inferFacing(bird),
  };
}

function inferFacing(bird: BirdState): Direction {
  if (bird.body.length < 2) {
    return "UP";
  }

  const head = bird.body[0];
  const neck = bird.body[1];
  if (!head || !neck) {
    return "UP";
  }
  const dx = head.x - neck.x;
  const dy = head.y - neck.y;

  if (dx === 1) {
    return "RIGHT";
  }
  if (dx === -1) {
    return "LEFT";
  }
  if (dy === 1) {
    return "DOWN";
  }
  return "UP";
}
