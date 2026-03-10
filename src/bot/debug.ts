import type { FeatureVector } from "./evaluator.js";

export interface FeatureContribution {
  name: keyof FeatureVector;
  value: number;
  weight: number;
  contribution: number;
}

export interface CandidateDebugRecord {
  jointAction: string;
  score: number;
  features: FeatureVector;
  contributions: FeatureContribution[];
  events: Array<{
    snakebotId: number;
    owner: string;
    kind: string;
    amount?: number;
    coord?: { x: number; y: number };
  }>;
}
