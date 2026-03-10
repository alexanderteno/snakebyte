import path from "node:path";

export type WeightKey =
  | "survivalImmediate"
  | "survivalAfterFall"
  | "applesEaten"
  | "nearestAppleDistance"
  | "appleRaceMargin"
  | "supportStability"
  | "selfCollisionRisk"
  | "enemyCollisionRisk"
  | "outOfBoundsRisk"
  | "reachableSpace"
  | "bodyCountDelta"
  | "headExposure";

export interface ExperimentConfig {
  engineDir: string;
  populationSize: number;
  gamesPerCandidate: number;
  weightKeys: WeightKey[];
  sparringCommand: string;
  seedSet: number[];
  eliteCount: number;
  maxGenerations: number;
  mutationScale: number;
  maxCandidateMovesPerSnakebot: number;
  maxJointActions: number;
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
  eliteCount: 4,
  maxGenerations: 10,
  mutationScale: 0.35,
  maxCandidateMovesPerSnakebot: 3,
  maxJointActions: 24,
  sparringCommand: defaultSparringCommand(),
  weightKeys: [
    "survivalImmediate",
    "survivalAfterFall",
    "applesEaten",
    "nearestAppleDistance",
    "appleRaceMargin",
    "supportStability",
    "selfCollisionRisk",
    "enemyCollisionRisk",
    "outOfBoundsRisk",
    "reachableSpace",
    "bodyCountDelta",
    "headExposure",
  ],
};
