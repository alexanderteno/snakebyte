import type { WeightKey } from "../config.js";
import type { MatchSummary } from "../engine/runMatch.js";

export type CandidateWeights = Record<WeightKey, number>;

export interface Candidate {
  id: string;
  weights: CandidateWeights;
}

export interface TournamentMatchResult {
  candidateId: string;
  opponentId: string;
  seed: number;
  seat: 0 | 1;
  summary: MatchSummary;
  scoreDelta: number;
  win: boolean;
  draw: boolean;
}

export interface TournamentResult {
  candidateId: string;
  matches: TournamentMatchResult[];
  averageScoreDelta: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  averageNonDrawMargin: number;
}

export interface GenerationSummary {
  generation: number;
  bestCandidateId: string | null;
  averageScoreDelta: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  averageNonDrawMargin: number;
  archiveSnapshot: string[];
  topCandidates: Array<{
    candidateId: string;
    averageScoreDelta: number;
    winRate: number;
    drawRate: number;
    lossRate: number;
    averageNonDrawMargin: number;
  }>;
}

export interface RunManifest {
  runId: string;
  startedAt: string;
  completedAt?: string;
  seedSet: number[];
  populationSize: number;
  eliteCount: number;
  maxGenerations: number;
  generationTopCount: number;
  bestCandidateIds: string[];
}
