import type { WeightKey } from "../config.js";
import type { MatchSummary } from "../engine/runMatch.js";

export type CandidateWeights = Record<WeightKey, number>;
export type OpponentClass = "mirror" | "elite" | "archive";

export interface Candidate {
  id: string;
  weights: CandidateWeights;
}

export interface TournamentMatchResult {
  candidateId: string;
  opponentId: string;
  opponentClass: OpponentClass;
  seed: number;
  seat: 0 | 1;
  summary: MatchSummary;
  scoreDelta: number;
  win: boolean;
  draw: boolean;
}

export interface AggregatedMatchMetrics {
  matchCount: number;
  averageScoreDelta: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
}

export interface TournamentResult {
  candidateId: string;
  matches: TournamentMatchResult[];
  fitness: number;
  averageScoreDelta: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  averageNonDrawMargin: number;
  scoreDeltaStdDev: number;
  byOpponentClass: Array<AggregatedMatchMetrics & { opponentClass: OpponentClass }>;
  bySeed: Array<AggregatedMatchMetrics & { seed: number }>;
}

export interface GenerationSummary {
  generation: number;
  bestCandidateId: string | null;
  fitness: number;
  averageScoreDelta: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  averageNonDrawMargin: number;
  scoreDeltaStdDev: number;
  archiveSnapshot: string[];
  topCandidates: Array<{
    candidateId: string;
    fitness: number;
    averageScoreDelta: number;
    winRate: number;
    drawRate: number;
    lossRate: number;
    averageNonDrawMargin: number;
    scoreDeltaStdDev: number;
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
