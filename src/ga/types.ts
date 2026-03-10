import type { WeightKey } from "../config.js";

export type CandidateWeights = Record<WeightKey, number>;

export interface Candidate {
  id: string;
  weights: CandidateWeights;
}

export interface MatchResult {
  candidateId: string;
  opponentId: string;
  seed: number;
  score: number;
  win: boolean;
}

