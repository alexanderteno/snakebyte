import path from "node:path";
import fs from "node:fs";
import { defaultExperimentConfig } from "../config.js";
import { runMatch, type MatchSummary } from "../engine/runMatch.js";
import type { Candidate, TournamentMatchResult, TournamentResult } from "./types.js";
import { writeCandidateWeights } from "./io.js";

export async function evaluateCandidateAgainstPool(
  candidate: Candidate,
  opponents: Candidate[],
  seeds = defaultExperimentConfig.seedSet,
): Promise<TournamentResult> {
  const matches: TournamentMatchResult[] = [];
  const evaluationOpponents = [candidate, ...opponents].filter((entry, index, values) =>
    values.findIndex((candidateEntry) => candidateEntry.id === entry.id) === index
  );

  for (const opponent of evaluationOpponents) {
    for (const seed of seeds) {
      for (const seat of [0, 1] as const) {
        const result = await runHeadlessMatch(candidate, opponent, seed, seat);
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
    averageScoreDelta: average(matches.map((match) => match.scoreDelta)),
    winRate: wins / Math.max(matches.length, 1),
    drawRate: draws / Math.max(matches.length, 1),
    lossRate: (matches.length - wins - draws) / Math.max(matches.length, 1),
    averageNonDrawMargin: average(nonDrawMargins),
  };
}

async function runHeadlessMatch(
  candidate: Candidate,
  opponent: Candidate,
  seed: number,
  seat: 0 | 1,
): Promise<TournamentMatchResult> {
  const candidateFile = path.relative(process.cwd(), writeCandidateWeights(candidate));
  const opponentFile = path.relative(process.cwd(), writeCandidateWeights(opponent));
  const candidateCommand = `${heuristicBotCommand()} --weights-file ${normalizeCommandPath(candidateFile)}`;
  const opponentCommand = `${heuristicBotCommand()} --weights-file ${normalizeCommandPath(opponentFile)}`;

  const summary = await runMatch({
    engineDir: defaultExperimentConfig.engineDir,
    player1Command: seat === 0 ? candidateCommand : opponentCommand,
    player2Command: seat === 0 ? opponentCommand : candidateCommand,
    seed,
    simulate: true,
  }, { quiet: true });

  if (!summary.summary) {
    throw new Error(`Missing match summary for candidate ${candidate.id} vs ${opponent.id} on seed ${seed}`);
  }

  return toTournamentResult(candidate.id, opponent.id, seed, seat, summary.summary);
}

function toTournamentResult(
  candidateId: string,
  opponentId: string,
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
