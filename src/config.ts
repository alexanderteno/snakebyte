import path from "node:path";

export type WeightKey =
  | "survivalImmediate"
  | "survivalAfterFall"
  | "applesEaten"
  | "adjacentAppleStall"
  | "nearestAppleDistance"
  | "pathAppleDistance"
  | "gravityAppleDistance"
  | "appleRaceMargin"
  | "appleControl"
  | "supportStability"
  | "supportDelta"
  | "selfCollisionRisk"
  | "enemyCollisionRisk"
  | "outOfBoundsRisk"
  | "fallDistance"
  | "reachableSpace"
  | "minReachableSpace"
  | "escapePressure"
  | "headToHeadPressure"
  | "opponentFirstReach"
  | "friendlyHeadPressure"
  | "bodyCountDelta"
  | "headExposure";

export interface ExperimentConfig {
  engineDir: string;
  populationSize: number;
  gamesPerCandidate: number;
  weightKeys: WeightKey[];
  sparringCommand: string;
  seedSet: number[];
  timeoutSeedSet: number[];
  passiveSeedSet: number[];
  eliteCount: number;
  maxGenerations: number;
  mutationScale: number;
  maxCandidateMovesPerSnakebot: number;
  maxJointActions: number;
  lookaheadEnabled: boolean;
  lookaheadTopActions: number;
  lookaheadDiscount: number;
  lookaheadGapThreshold: number;
  archiveSize: number;
  generationTopCount: number;
}

function envNumber(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envFlag(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  return rawValue === "1" || rawValue.toLowerCase() === "true";
}

function defaultSparringCommand(): string {
  return process.platform === "win32"
    ? "python engine/config/Boss.py"
    : "python3 engine/config/Boss.py";
}

export const defaultExperimentConfig: ExperimentConfig = {
  engineDir: path.resolve(process.cwd(), "engine"),
  populationSize: 24,
  gamesPerCandidate: 40,
  seedSet: [1, 7, 19, 31],
  timeoutSeedSet: [
    5556729728041560000,
    766968810929167900,
  ],
  passiveSeedSet: [
    1672425175878651600,
    7548755813993756000,
    3910911367656163300,
    845531199520145500,
  ],
  eliteCount: 4,
  maxGenerations: 10,
  mutationScale: 0.35,
  maxCandidateMovesPerSnakebot: 3,
  maxJointActions: 24,
  lookaheadEnabled: envFlag("SNAKEBYTE_LOOKAHEAD", false),
  lookaheadTopActions: envNumber("SNAKEBYTE_LOOKAHEAD_TOP_ACTIONS", 4),
  lookaheadDiscount: envNumber("SNAKEBYTE_LOOKAHEAD_DISCOUNT", 0.6),
  lookaheadGapThreshold: envNumber("SNAKEBYTE_LOOKAHEAD_GAP_THRESHOLD", 0.5),
  archiveSize: envNumber("SNAKEBYTE_ARCHIVE_SIZE", 12),
  generationTopCount: envNumber("SNAKEBYTE_GENERATION_TOP_COUNT", 5),
  sparringCommand: defaultSparringCommand(),
  weightKeys: [
    "survivalImmediate",
    "survivalAfterFall",
    "applesEaten",
    "adjacentAppleStall",
    "nearestAppleDistance",
    "pathAppleDistance",
    "gravityAppleDistance",
    "appleRaceMargin",
    "appleControl",
    "supportStability",
    "supportDelta",
    "selfCollisionRisk",
    "enemyCollisionRisk",
    "outOfBoundsRisk",
    "fallDistance",
    "reachableSpace",
    "minReachableSpace",
    "escapePressure",
    "headToHeadPressure",
    "opponentFirstReach",
    "friendlyHeadPressure",
    "bodyCountDelta",
    "headExposure",
  ],
};
