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
}

export const defaultExperimentConfig: ExperimentConfig = {
  engineDir: path.resolve(process.cwd(), "engine"),
  populationSize: 24,
  gamesPerCandidate: 40,
  weightKeys: [
    "survival",
    "appleDistance",
    "enemyPressure",
    "selfTrapRisk",
    "headCollisionRisk",
    "supportStability",
  ],
};

