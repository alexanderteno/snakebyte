import path from "node:path";
import fs from "node:fs";
import { defaultExperimentConfig } from "../config.js";
import { runMatch, type MatchSummary } from "../engine/runMatch.js";
import type { AggregatedMatchMetrics, Candidate, OpponentClass, TournamentMatchResult, TournamentResult } from "./types.js";
import { writeCandidateWeights } from "./io.js";

export interface EvaluationOpponent {
  candidate: Candidate;
  opponentClass: OpponentClass;
}

export async function evaluateCandidateAgainstPool(
  candidate: Candidate,
  opponents: EvaluationOpponent[],
  seeds = defaultExperimentConfig.seedSet,
): Promise<TournamentResult> {
  const matches: TournamentMatchResult[] = [];
  const evaluationOpponents = [{ candidate, opponentClass: "mirror" as const }, ...opponents].filter((entry, index, values) =>
    values.findIndex((candidateEntry) => candidateEntry.candidate.id === entry.candidate.id) === index
  );

  for (const opponent of evaluationOpponents) {
    for (const seed of seeds) {
      for (const seat of [0, 1] as const) {
        const result = await runHeadlessMatch(candidate, opponent.candidate, opponent.opponentClass, seed, seat);
        matches.push(result);
      }
    }
  }

  const wins = matches.filter((match) => match.win).length;
  const draws = matches.filter((match) => match.draw).length;
  const nonDrawMargins = matches.filter((match) => !match.draw).map((match) => match.scoreDelta);

  return {
    candidateId: candidate.id,
    matches,
    fitness: computeFitness(matches),
    averageScoreDelta: average(matches.map((match) => match.scoreDelta)),
    winRate: wins / Math.max(matches.length, 1),
    drawRate: draws / Math.max(matches.length, 1),
    lossRate: (matches.length - wins - draws) / Math.max(matches.length, 1),
    averageNonDrawMargin: average(nonDrawMargins),
    scoreDeltaStdDev: standardDeviation(matches.map((match) => match.scoreDelta)),
    byOpponentClass: aggregateByOpponentClass(matches),
    bySeed: aggregateBySeed(matches),
  };
}

async function runHeadlessMatch(
  candidate: Candidate,
  opponent: Candidate,
  opponentClass: OpponentClass,
  seed: number,
  seat: 0 | 1,
): Promise<TournamentMatchResult> {
  const candidateFile = path.relative(process.cwd(), writeCandidateWeights(candidate));
  const opponentFile = path.relative(process.cwd(), writeCandidateWeights(opponent));
  const candidateCommand = `${heuristicBotCommand()} --weights-file ${normalizeCommandPath(candidateFile)}`;
  const opponentCommand = `${heuristicBotCommand()} --weights-file ${normalizeCommandPath(opponentFile)}`;
  const player1Command = seat === 0 ? candidateCommand : opponentCommand;
  const player2Command = seat === 0 ? opponentCommand : candidateCommand;
  const maxAttempts = 2;
  let lastResult: Awaited<ReturnType<typeof runMatch>> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runMatch({
      engineDir: defaultExperimentConfig.engineDir,
      player1Command,
      player2Command,
      seed,
      simulate: true,
    }, { quiet: true });
    lastResult = result;

    if (result.summary) {
      return toTournamentResult(candidate.id, opponent.id, opponentClass, seed, seat, result.summary);
    }
  }

  const stderrPreview = lastResult?.stderr.trim().split(/\r?\n/).slice(-10).join(" | ") ?? "NO_STDERR";
  const stdoutPreview = lastResult?.stdout.trim().split(/\r?\n/).slice(-10).join(" | ") ?? "NO_STDOUT";
  throw new Error(
    `Missing match summary for candidate ${candidate.id} vs ${opponent.id} on seed ${seed} seat ${seat}. stdout=${stdoutPreview} stderr=${stderrPreview}`,
  );
}

function toTournamentResult(
  candidateId: string,
  opponentId: string,
  opponentClass: OpponentClass,
  seed: number,
  seat: 0 | 1,
  summary: MatchSummary,
): TournamentMatchResult {
  const myScore = seat === 0 ? summary.player1Score : summary.player2Score;
  const opponentScore = seat === 0 ? summary.player2Score : summary.player1Score;
  const scoreDelta = myScore - opponentScore;

  return {
    candidateId,
    opponentId,
    opponentClass,
    seed,
    seat,
    summary,
    scoreDelta,
    win: scoreDelta > 0,
    draw: scoreDelta === 0,
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => ((value - mean) ** 2)));
  return Math.sqrt(variance);
}

function computeFitness(matches: TournamentMatchResult[]): number {
  const averageScoreDelta = average(matches.map((match) => match.scoreDelta));
  const winRate = matches.filter((match) => match.win).length / Math.max(matches.length, 1);
  const drawRate = matches.filter((match) => match.draw).length / Math.max(matches.length, 1);
  const averageNonDrawMargin = average(matches.filter((match) => !match.draw).map((match) => match.scoreDelta));
  const stdDev = standardDeviation(matches.map((match) => match.scoreDelta));

  return averageScoreDelta
    + (winRate * 2)
    + (averageNonDrawMargin * 0.2)
    - (drawRate * 1.5)
    - (stdDev * 0.15);
}

function aggregateByOpponentClass(matches: TournamentMatchResult[]): Array<AggregatedMatchMetrics & { opponentClass: OpponentClass }> {
  const grouped = new Map<OpponentClass, TournamentMatchResult[]>();
  for (const match of matches) {
    const bucket = grouped.get(match.opponentClass) ?? [];
    bucket.push(match);
    grouped.set(match.opponentClass, bucket);
  }

  return [...grouped.entries()].map(([opponentClass, group]) => ({
    opponentClass,
    ...aggregateMatches(group),
  }));
}

function aggregateBySeed(matches: TournamentMatchResult[]): Array<AggregatedMatchMetrics & { seed: number }> {
  const grouped = new Map<number, TournamentMatchResult[]>();
  for (const match of matches) {
    const bucket = grouped.get(match.seed) ?? [];
    bucket.push(match);
    grouped.set(match.seed, bucket);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([seed, group]) => ({
      seed,
      ...aggregateMatches(group),
    }));
}

function aggregateMatches(matches: TournamentMatchResult[]): AggregatedMatchMetrics {
  const wins = matches.filter((match) => match.win).length;
  const draws = matches.filter((match) => match.draw).length;

  return {
    matchCount: matches.length,
    averageScoreDelta: average(matches.map((match) => match.scoreDelta)),
    winRate: wins / Math.max(matches.length, 1),
    drawRate: draws / Math.max(matches.length, 1),
    lossRate: (matches.length - wins - draws) / Math.max(matches.length, 1),
  };
}

function heuristicBotCommand(): string {
  const builtBot = path.resolve(process.cwd(), "dist", "bot", "cli.js");
  if (fs.existsSync(builtBot)) {
    return "node dist/bot/cli.js";
  }

  return "node --import tsx src/bot/cli.ts";
}

function normalizeCommandPath(value: string): string {
  return value.replaceAll("\\", "/");
}
