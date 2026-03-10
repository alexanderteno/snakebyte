import { randomUUID } from "node:crypto";
import type { WeightKey } from "../config.js";
import type { Candidate, CandidateWeights } from "./types.js";

function randomWeight(): number {
  return (Math.random() * 10) - 5;
}

function createWeights(keys: WeightKey[]): CandidateWeights {
  return Object.fromEntries(keys.map((key) => [key, randomWeight()])) as CandidateWeights;
}

export function createRandomPopulation(size: number, keys: WeightKey[]): Candidate[] {
  return Array.from({ length: size }, () => ({
    id: randomUUID(),
    weights: createWeights(keys),
  }));
}
