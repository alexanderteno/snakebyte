import type { JointAction, Direction } from "./actions.js";
import type { Coord } from "./protocol.js";
import { coordKey, moveCoord, type RuntimeState, type Snakebot, type SnakebotOwner } from "./state.js";

export type TurnEventKind = "move" | "eat" | "behead" | "die" | "fall" | "outOfBounds";

export interface TurnEvent {
  snakebotId: number;
  kind: TurnEventKind;
  owner: SnakebotOwner;
  amount?: number;
  coord?: Coord;
}

export interface SimulatedSnakebot {
  id: number;
  owner: SnakebotOwner;
  body: Coord[];
  head: Coord;
  facing: Direction;
  alive: boolean;
}

export interface SimulatedState {
  width: number;
  height: number;
  rows: string[];
  apples: Coord[];
  mySnakebots: SimulatedSnakebot[];
  opponentSnakebots: SimulatedSnakebot[];
  occupancy: Map<string, number>;
}

export interface ResolvedTurn {
  nextState: SimulatedState;
  events: TurnEvent[];
  applesConsumed: Coord[];
  removedSnakebotIds: number[];
  aliveAfterBeheadingIds: Set<number>;
  aliveAfterFallsIds: Set<number>;
}

export function simulateTurn(state: RuntimeState, jointAction: JointAction): ResolvedTurn {
  const events: TurnEvent[] = [];
  const apples = [...state.apples];
  const snakebots = [...state.mySnakebots, ...state.opponentSnakebots].map(cloneSnakebot);
  const chosenDirections = new Map(jointAction.actions.map((action) => [action.snakebotId, action.direction]));

  doMoves(snakebots, apples, chosenDirections, events);
  const applesConsumed = doEats(snakebots, apples, events);
  doBeheadings(snakebots, state.global.rows, events);
  const aliveAfterBeheadingIds = new Set(snakebots.filter((snakebot) => snakebot.alive).map((snakebot) => snakebot.id));
  const removedSnakebotIds = doFalls(snakebots, apples, state.global.rows, state.height, events);
  const aliveAfterFallsIds = new Set(snakebots.filter((snakebot) => snakebot.alive).map((snakebot) => snakebot.id));

  return {
    nextState: buildSimulatedState(state, snakebots, apples),
    events,
    applesConsumed,
    removedSnakebotIds,
    aliveAfterBeheadingIds,
    aliveAfterFallsIds,
  };
}

function buildSimulatedState(
  state: RuntimeState,
  snakebots: SimulatedSnakebot[],
  apples: Coord[],
): SimulatedState {
  const occupancy = new Map<string, number>();
  for (const snakebot of snakebots.filter((entry) => entry.alive)) {
    for (const coord of snakebot.body) {
      occupancy.set(coordKey(coord), snakebot.id);
    }
  }

  return {
    width: state.width,
    height: state.height,
    rows: state.global.rows,
    apples: [...apples],
    mySnakebots: snakebots.filter((snakebot) => snakebot.owner === "me" && snakebot.alive),
    opponentSnakebots: snakebots.filter((snakebot) => snakebot.owner === "opponent" && snakebot.alive),
    occupancy,
  };
}

function doMoves(
  snakebots: SimulatedSnakebot[],
  apples: Coord[],
  chosenDirections: Map<number, Direction>,
  events: TurnEvent[],
): void {
  for (const snakebot of snakebots) {
    if (!snakebot.alive) {
      continue;
    }

    const direction = chosenDirections.get(snakebot.id) ?? snakebot.facing;
    snakebot.facing = direction;

    const newHead = moveCoord(snakebot.head, direction);
    const willEatApple = apples.some((apple) => coordsEqual(apple, newHead));

    if (!willEatApple) {
      snakebot.body.pop();
    }

    snakebot.body.unshift(newHead);
    snakebot.head = newHead;
    events.push({ snakebotId: snakebot.id, kind: "move", owner: snakebot.owner, coord: newHead });
  }
}

function doEats(snakebots: SimulatedSnakebot[], apples: Coord[], events: TurnEvent[]): Coord[] {
  const applesConsumed: Coord[] = [];
  const consumedKeys = new Set<string>();

  for (const snakebot of snakebots) {
    if (!snakebot.alive) {
      continue;
    }

    const key = coordKey(snakebot.head);
    const eatenApple = apples.find((apple) => coordKey(apple) === key);
    if (!eatenApple) {
      continue;
    }

    events.push({ snakebotId: snakebot.id, kind: "eat", owner: snakebot.owner, coord: eatenApple, amount: 1 });
    if (!consumedKeys.has(key)) {
      applesConsumed.push(eatenApple);
      consumedKeys.add(key);
    }
  }

  for (const apple of applesConsumed) {
    const index = apples.findIndex((entry) => coordsEqual(entry, apple));
    if (index !== -1) {
      apples.splice(index, 1);
    }
  }

  return applesConsumed;
}

function doBeheadings(snakebots: SimulatedSnakebot[], rows: string[], events: TurnEvent[]): void {
  const liveSnakebots = snakebots.filter((snakebot) => snakebot.alive);
  const snakebotsToBehead: SimulatedSnakebot[] = [];

  for (const snakebot of liveSnakebots) {
    const isInWall = getTileType(rows, snakebot.head) === "#";
    const intersectingSnakebots = liveSnakebots.filter((entry) => entry.body.some((coord) => coordsEqual(coord, snakebot.head)));
    const isInOtherSnakebot = intersectingSnakebots.some((entry) => entry.id !== snakebot.id);

    if (isInWall || isInOtherSnakebot) {
      snakebotsToBehead.push(snakebot);
    }
  }

  for (const snakebot of snakebotsToBehead) {
    if (!snakebot.alive) {
      continue;
    }

    if (snakebot.body.length <= 3) {
      snakebot.alive = false;
      events.push({ snakebotId: snakebot.id, kind: "die", owner: snakebot.owner, coord: snakebot.head });
      continue;
    }

    snakebot.body.shift();
    snakebot.head = snakebot.body[0] ?? snakebot.head;
    events.push({ snakebotId: snakebot.id, kind: "behead", owner: snakebot.owner, coord: snakebot.head });
  }
}

function doFalls(
  snakebots: SimulatedSnakebot[],
  apples: Coord[],
  rows: string[],
  height: number,
  events: TurnEvent[],
): number[] {
  let somethingFell = true;
  const fallDistances = new Map<number, number>();
  const removed = new Set<number>();

  while (somethingFell) {
    somethingFell = false;

    let innerFell = true;
    while (innerFell) {
      innerFell = false;

      for (const snakebot of snakebots.filter((entry) => entry.alive)) {
        const canFall = snakebot.body.every((coord) => !somethingSolidUnder(coord, snakebot.body, snakebots, apples, rows));
        if (!canFall) {
          continue;
        }

        innerFell = true;
        somethingFell = true;
        dropSnakebot(snakebot);
        fallDistances.set(snakebot.id, (fallDistances.get(snakebot.id) ?? 0) + 1);

        if (snakebot.body.every((coord) => coord.y >= height + 1)) {
          snakebot.alive = false;
          removed.add(snakebot.id);
        }
      }
    }

    const intercoiledGroups = getIntercoiledGroups(snakebots.filter((entry) => entry.alive));
    for (const group of intercoiledGroups) {
      const metaBody = group.flatMap((snakebot) => snakebot.body);
      const canFall = metaBody.every((coord) => !somethingSolidUnder(coord, metaBody, snakebots, apples, rows));
      if (!canFall) {
        continue;
      }

      somethingFell = true;
      for (const snakebot of group) {
        dropSnakebot(snakebot);
        fallDistances.set(snakebot.id, (fallDistances.get(snakebot.id) ?? 0) + 1);
        if (snakebot.head.y >= height) {
          snakebot.alive = false;
          removed.add(snakebot.id);
        }
      }
    }
  }

  for (const [snakebotId, amount] of fallDistances.entries()) {
    const snakebot = snakebots.find((entry) => entry.id === snakebotId);
    if (snakebot && amount > 0) {
      events.push({ snakebotId, kind: "fall", owner: snakebot.owner, amount });
    }
  }

  for (const snakebotId of removed) {
    const snakebot = snakebots.find((entry) => entry.id === snakebotId);
    if (snakebot) {
      events.push({ snakebotId, kind: "outOfBounds", owner: snakebot.owner });
    }
  }

  return [...removed];
}

function somethingSolidUnder(
  coord: Coord,
  ignoreBody: Coord[],
  snakebots: SimulatedSnakebot[],
  apples: Coord[],
  rows: string[],
): boolean {
  const below = { x: coord.x, y: coord.y + 1 };
  if (ignoreBody.some((entry) => coordsEqual(entry, below))) {
    return false;
  }
  if (getTileType(rows, below) === "#") {
    return true;
  }
  if (snakebots.some((snakebot) => snakebot.alive && snakebot.body.some((entry) => coordsEqual(entry, below)))) {
    return true;
  }
  return apples.some((apple) => coordsEqual(apple, below));
}

function getIntercoiledGroups(snakebots: SimulatedSnakebot[]): SimulatedSnakebot[][] {
  const groups: SimulatedSnakebot[][] = [];
  const visited = new Set<number>();

  for (const snakebot of snakebots) {
    if (visited.has(snakebot.id)) {
      continue;
    }

    const group: SimulatedSnakebot[] = [];
    const stack = [snakebot];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current.id)) {
        continue;
      }

      visited.add(current.id);
      group.push(current);
      for (const other of snakebots) {
        if (other.id === current.id || visited.has(other.id)) {
          continue;
        }
        if (snakebotsTouch(current, other)) {
          stack.push(other);
        }
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

function snakebotsTouch(left: SimulatedSnakebot, right: SimulatedSnakebot): boolean {
  return left.body.some((leftCoord) =>
    right.body.some((rightCoord) => manhattanDistance(leftCoord, rightCoord) === 1),
  );
}

function dropSnakebot(snakebot: SimulatedSnakebot): void {
  snakebot.body = snakebot.body.map((coord) => ({ x: coord.x, y: coord.y + 1 }));
  snakebot.head = snakebot.body[0] ?? snakebot.head;
}

function getTileType(rows: string[], coord: Coord): string | undefined {
  return rows[coord.y]?.[coord.x];
}

function cloneSnakebot(snakebot: Snakebot): SimulatedSnakebot {
  return {
    id: snakebot.id,
    owner: snakebot.owner,
    body: snakebot.body.map((coord) => ({ ...coord })),
    head: { ...snakebot.head },
    facing: snakebot.facing,
    alive: true,
  };
}

function coordsEqual(left: Coord, right: Coord): boolean {
  return left.x === right.x && left.y === right.y;
}

function manhattanDistance(left: Coord, right: Coord): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}
