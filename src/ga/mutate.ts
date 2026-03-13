import { randomUUID } from "node:crypto";
import { defaultExperimentConfig } from "../config.js";
import { constrainWeights } from "./constraints.js";
import type { Candidate, CandidateWeights } from "./types.js";

export function mutateCandidate(parent: Candidate, scale = defaultExperimentConfig.mutationScale): Candidate {
  const weights = { ...parent.weights } as CandidateWeights;

  for (const key of defaultExperimentConfig.weightKeys) {
    const delta = gaussianNoise() * scale;
    weights[key] += delta;
  }

  return {
    id: randomUUID(),
    weights: constrainWeights(weights),
  };
}

function gaussianNoise(): number {
  let u = 0;
  let v = 0;
  while (u === 0) {
    u = Math.random();
  }
  while (v === 0) {
    v = Math.random();
  }
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
