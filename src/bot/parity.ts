import { simulateTurn } from "./simulator.js";
import type { JointAction } from "./actions.js";
import type { Coord } from "./protocol.js";
import type { RuntimeState, SnakebotOwner } from "./state.js";

interface ExpectedSnakebot {
  id: number;
  body: Coord[];
}

interface ExpectedEvent {
  snakebotId: number;
  kind: string;
}

interface ParityScenario {
  name: string;
  state: RuntimeState;
  jointAction: JointAction;
  expected: {
    mySnakebots: ExpectedSnakebot[];
    opponentSnakebots: ExpectedSnakebot[];
    apples: Coord[];
    events: ExpectedEvent[];
  };
}

function createRuntimeStateFixture(args: {
  width: number;
  height: number;
  rows: string[];
  apples: Coord[];
  mySnakebots: Array<{ id: number; body: Coord[]; facing: "UP" | "DOWN" | "LEFT" | "RIGHT" }>;
  opponentSnakebots?: Array<{ id: number; body: Coord[]; facing: "UP" | "DOWN" | "LEFT" | "RIGHT" }>;
}): RuntimeState {
  const mySnakebots = args.mySnakebots.map((snakebot) => toSnakebot(snakebot, "me"));
  const opponentSnakebots = (args.opponentSnakebots ?? []).map((snakebot) => toSnakebot(snakebot, "opponent"));
  const occupancy = new Map<string, number>();
  for (const snakebot of [...mySnakebots, ...opponentSnakebots]) {
    for (const coord of snakebot.body) {
      occupancy.set(`${coord.x},${coord.y}`, snakebot.id);
    }
  }

  return {
    global: {
      playerIndex: 0,
      width: args.width,
      height: args.height,
      rows: args.rows,
      birdsPerPlayer: Math.max(args.mySnakebots.length, args.opponentSnakebots?.length ?? 0),
      myBirdIds: mySnakebots.map((snakebot) => snakebot.id),
      opponentBirdIds: opponentSnakebots.map((snakebot) => snakebot.id),
    },
    frame: {
      apples: args.apples,
      birds: [...mySnakebots, ...opponentSnakebots],
    },
    width: args.width,
    height: args.height,
    apples: args.apples,
    mySnakebots,
    opponentSnakebots,
    occupancy,
    appleSet: new Set(args.apples.map((coord) => `${coord.x},${coord.y}`)),
    config: {
      maxCandidateMovesPerSnakebot: 3,
      maxJointActions: 24,
    },
  };
}

function toSnakebot(
  snakebot: { id: number; body: Coord[]; facing: "UP" | "DOWN" | "LEFT" | "RIGHT" },
  owner: SnakebotOwner,
) {
  return {
    id: snakebot.id,
    body: snakebot.body.map((coord) => ({ ...coord })),
    head: { ...(snakebot.body[0] ?? { x: 0, y: 0 }) },
    length: snakebot.body.length,
    facing: snakebot.facing,
    owner,
  };
}

const scenarios: ParityScenario[] = [
  {
    name: "simple move with no collision",
    state: createRuntimeStateFixture({
      width: 6,
      height: 5,
      rows: ["......", "......", "......", "######", "######"],
      apples: [],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], facing: "UP" }],
    }),
    jointAction: { actions: [{ snakebotId: 1, direction: "RIGHT" }] },
    expected: {
      mySnakebots: [{ id: 1, body: [{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }] }],
      opponentSnakebots: [],
      apples: [],
      events: [{ snakebotId: 1, kind: "move" }],
    },
  },
  {
    name: "apple consumption and growth",
    state: createRuntimeStateFixture({
      width: 6,
      height: 5,
      rows: ["......", "......", "......", "######", "######"],
      apples: [{ x: 2, y: 1 }],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], facing: "UP" }],
    }),
    jointAction: { actions: [{ snakebotId: 1, direction: "RIGHT" }] },
    expected: {
      mySnakebots: [{ id: 1, body: [{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }] }],
      opponentSnakebots: [],
      apples: [],
      events: [{ snakebotId: 1, kind: "move" }, { snakebotId: 1, kind: "eat" }],
    },
  },
  {
    name: "wall collision causing death when too short",
    state: createRuntimeStateFixture({
      width: 5,
      height: 5,
      rows: ["..#..", ".....", ".....", "#####", "#####"],
      apples: [],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }], facing: "UP" }],
    }),
    jointAction: { actions: [{ snakebotId: 1, direction: "RIGHT" }] },
    expected: {
      mySnakebots: [],
      opponentSnakebots: [],
      apples: [],
      events: [{ snakebotId: 1, kind: "move" }, { snakebotId: 1, kind: "die" }],
    },
  },
  {
    name: "collision with opponent body causes beheading",
    state: createRuntimeStateFixture({
      width: 7,
      height: 5,
      rows: [".......", ".......", ".......", "#######", "#######"],
      apples: [],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }], facing: "UP" }],
      opponentSnakebots: [{ id: 2, body: [{ x: 3, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }], facing: "RIGHT" }],
    }),
    jointAction: { actions: [{ snakebotId: 1, direction: "RIGHT" }] },
    expected: {
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }] }],
      opponentSnakebots: [{ id: 2, body: [{ x: 4, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
      apples: [],
      events: [{ snakebotId: 1, kind: "move" }, { snakebotId: 2, kind: "move" }, { snakebotId: 1, kind: "behead" }, { snakebotId: 2, kind: "fall" }],
    },
  },
  {
    name: "collision with own body causes beheading",
    state: createRuntimeStateFixture({
      width: 6,
      height: 5,
      rows: ["......", "......", "......", "######", "######"],
      apples: [],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }], facing: "UP" }],
    }),
    jointAction: { actions: [{ snakebotId: 1, direction: "DOWN" }] },
    expected: {
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }] }],
      opponentSnakebots: [],
      apples: [],
      events: [{ snakebotId: 1, kind: "move" }, { snakebotId: 1, kind: "behead" }],
    },
  },
  {
    name: "simultaneous head overlap on empty space removes both short snakebots",
    state: createRuntimeStateFixture({
      width: 7,
      height: 6,
      rows: [".......", ".......", ".......", ".......", "#######", "#######"],
      apples: [],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], facing: "UP" }],
      opponentSnakebots: [{ id: 2, body: [{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }], facing: "UP" }],
    }),
    jointAction: {
      actions: [
        { snakebotId: 1, direction: "RIGHT" },
        { snakebotId: 2, direction: "LEFT" },
      ],
    },
    expected: {
      mySnakebots: [],
      opponentSnakebots: [],
      apples: [],
      events: [
        { snakebotId: 1, kind: "move" },
        { snakebotId: 2, kind: "move" },
        { snakebotId: 1, kind: "die" },
        { snakebotId: 2, kind: "die" },
      ],
    },
  },
  {
    name: "simultaneous head overlap on apple lets both eat before dying",
    state: createRuntimeStateFixture({
      width: 7,
      height: 6,
      rows: [".......", ".......", ".......", ".......", "#######", "#######"],
      apples: [{ x: 2, y: 1 }],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], facing: "UP" }],
      opponentSnakebots: [{ id: 2, body: [{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }], facing: "UP" }],
    }),
    jointAction: {
      actions: [
        { snakebotId: 1, direction: "RIGHT" },
        { snakebotId: 2, direction: "LEFT" },
      ],
    },
    expected: {
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }] }],
      opponentSnakebots: [{ id: 2, body: [{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }] }],
      apples: [],
      events: [
        { snakebotId: 1, kind: "move" },
        { snakebotId: 2, kind: "move" },
        { snakebotId: 1, kind: "eat" },
        { snakebotId: 2, kind: "eat" },
        { snakebotId: 1, kind: "behead" },
        { snakebotId: 2, kind: "behead" },
      ],
    },
  },
  {
    name: "falling until support",
    state: createRuntimeStateFixture({
      width: 5,
      height: 6,
      rows: [".....", ".....", ".....", ".....", "#####", "#####"],
      apples: [],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], facing: "UP" }],
    }),
    jointAction: { actions: [{ snakebotId: 1, direction: "RIGHT" }] },
    expected: {
      mySnakebots: [{ id: 1, body: [{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }] }],
      opponentSnakebots: [],
      apples: [],
      events: [{ snakebotId: 1, kind: "move" }, { snakebotId: 1, kind: "fall" }],
    },
  },
  {
    name: "falling out of bounds removes unsupported snakebot",
    state: createRuntimeStateFixture({
      width: 5,
      height: 4,
      rows: [".....", ".....", ".....", "....."],
      apples: [],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], facing: "UP" }],
    }),
    jointAction: { actions: [{ snakebotId: 1, direction: "RIGHT" }] },
    expected: {
      mySnakebots: [],
      opponentSnakebots: [],
      apples: [],
      events: [{ snakebotId: 1, kind: "move" }, { snakebotId: 1, kind: "fall" }, { snakebotId: 1, kind: "outOfBounds" }],
    },
  },
  {
    name: "support from apple prevents falling",
    state: createRuntimeStateFixture({
      width: 5,
      height: 5,
      rows: [".....", ".....", ".....", ".....", "....."],
      apples: [{ x: 2, y: 2 }],
      mySnakebots: [{ id: 1, body: [{ x: 2, y: 1 }, { x: 2, y: 2 }], facing: "UP" }],
    }),
    jointAction: { actions: [{ snakebotId: 1, direction: "UP" }] },
    expected: {
      mySnakebots: [{ id: 1, body: [{ x: 2, y: 0 }, { x: 2, y: 1 }] }],
      opponentSnakebots: [],
      apples: [{ x: 2, y: 2 }],
      events: [{ snakebotId: 1, kind: "move" }],
    },
  },
  {
    name: "support from another snakebot prevents falling",
    state: createRuntimeStateFixture({
      width: 6,
      height: 5,
      rows: ["......", "......", "......", "######", "######"],
      apples: [],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 1 }, { x: 1, y: 2 }], facing: "UP" }],
      opponentSnakebots: [{ id: 2, body: [{ x: 2, y: 2 }, { x: 3, y: 2 }], facing: "LEFT" }],
    }),
    jointAction: {
      actions: [
        { snakebotId: 1, direction: "UP" },
        { snakebotId: 2, direction: "LEFT" },
      ],
    },
    expected: {
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 0 }, { x: 1, y: 1 }] }],
      opponentSnakebots: [{ id: 2, body: [{ x: 1, y: 2 }, { x: 2, y: 2 }] }],
      apples: [],
      events: [{ snakebotId: 1, kind: "move" }, { snakebotId: 2, kind: "move" }],
    },
  },
  {
    name: "airborne snakebots only support each other after one becomes grounded",
    state: createRuntimeStateFixture({
      width: 5,
      height: 6,
      rows: [".....", ".....", ".....", ".....", "#####", "#####"],
      apples: [],
      mySnakebots: [{ id: 1, body: [{ x: 1, y: 0 }, { x: 1, y: 1 }], facing: "UP" }],
      opponentSnakebots: [{ id: 2, body: [{ x: 2, y: 2 }, { x: 2, y: 3 }], facing: "UP" }],
    }),
    jointAction: {
      actions: [
        { snakebotId: 1, direction: "RIGHT" },
        { snakebotId: 2, direction: "UP" },
      ],
    },
    expected: {
      mySnakebots: [{ id: 1, body: [{ x: 2, y: 1 }, { x: 1, y: 1 }] }],
      opponentSnakebots: [{ id: 2, body: [{ x: 2, y: 2 }, { x: 2, y: 3 }] }],
      apples: [],
      events: [
        { snakebotId: 1, kind: "move" },
        { snakebotId: 2, kind: "move" },
        { snakebotId: 1, kind: "fall" },
        { snakebotId: 2, kind: "fall" },
      ],
    },
  },
];

function normalizeSnakebots(entries: ExpectedSnakebot[]): Array<{ id: number; body: string[] }> {
  return entries
    .map((entry) => ({
      id: entry.id,
      body: entry.body.map(formatCoord),
    }))
    .sort((left, right) => left.id - right.id);
}

function formatCoord(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

function normalizeEvents(entries: ExpectedEvent[]): Array<{ snakebotId: number; kind: string }> {
  return entries
    .map((entry) => ({ snakebotId: entry.snakebotId, kind: entry.kind }))
    .sort(compareEventRecords);
}

function compareEventRecords(left: { snakebotId: number; kind: string }, right: { snakebotId: number; kind: string }): number {
  if (left.snakebotId !== right.snakebotId) {
    return left.snakebotId - right.snakebotId;
  }
  return left.kind.localeCompare(right.kind);
}

export function runParityChecks(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    const resolved = simulateTurn(scenario.state, scenario.jointAction);
    const actual = {
      mySnakebots: normalizeSnakebots(
        resolved.nextState.mySnakebots.map((snakebot) => ({ id: snakebot.id, body: snakebot.body })),
      ),
      opponentSnakebots: normalizeSnakebots(
        resolved.nextState.opponentSnakebots.map((snakebot) => ({ id: snakebot.id, body: snakebot.body })),
      ),
      apples: resolved.nextState.apples.map(formatCoord).sort(),
      events: normalizeEvents(resolved.events.map((event) => ({ snakebotId: event.snakebotId, kind: event.kind }))),
    };
    const expected = {
      mySnakebots: normalizeSnakebots(scenario.expected.mySnakebots),
      opponentSnakebots: normalizeSnakebots(scenario.expected.opponentSnakebots),
      apples: scenario.expected.apples.map(formatCoord).sort(),
      events: normalizeEvents(scenario.expected.events),
    };

    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
      passed += 1;
      process.stdout.write(`PASS ${scenario.name}\n`);
      continue;
    }

    failed += 1;
    process.stderr.write(`FAIL ${scenario.name}\n`);
    process.stderr.write(`  actual=${JSON.stringify(actual)}\n`);
    process.stderr.write(`  expected=${JSON.stringify(expected)}\n`);
  }

  return { passed, failed };
}
