import fs from "node:fs";
import path from "node:path";
import { defaultExperimentConfig } from "../config.js";
import type { CandidateWeights } from "../ga/types.js";

export const DEFAULT_WEIGHTS: CandidateWeights = {
  survivalImmediate: 500,
  survivalAfterFall: 400,
  applesEaten: 45,
  nearestAppleDistance: -6,
  appleRaceMargin: 8,
  supportStability: 30,
  selfCollisionRisk: -120,
  enemyCollisionRisk: -90,
  outOfBoundsRisk: -200,
  reachableSpace: 4,
  bodyCountDelta: 3,
  headExposure: -10,
};

export function loadWeights(argv: string[]): CandidateWeights {
  const weightsFile = getFlagValue(argv, "--weights-file");
  if (!weightsFile) {
    return DEFAULT_WEIGHTS;
  }

  const resolved = path.resolve(process.cwd(), weightsFile);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8")) as Partial<CandidateWeights>;

  return {
    ...DEFAULT_WEIGHTS,
    ...Object.fromEntries(
      defaultExperimentConfig.weightKeys.map((key) => [key, parsed[key] ?? DEFAULT_WEIGHTS[key]]),
    ),
  } as CandidateWeights;
}

function getFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}
