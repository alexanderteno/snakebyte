import path from "node:path";

export type WeightKey =
  | "survival"
  | "appleDistance"
  | "enemyPressure"
  | "selfTrapRisk"
  | "headCollisionRisk"
  | "supportStability";

export interface ExperimentConfig {
  engineDir: string;
  populationSize: number;
  gamesPerCandidate: number;
  weightKeys: WeightKey[];
  sparringCommand: string;
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
  sparringCommand: defaultSparringCommand(),
  weightKeys: [
    "survival",
    "appleDistance",
    "enemyPressure",
    "selfTrapRisk",
    "headCollisionRisk",
    "supportStability",
  ],
};
