import fs from "node:fs";
import path from "node:path";
import { defaultExperimentConfig } from "./config.js";
import { runMatch, type MatchCommandResult, type MatchSummary } from "./engine/runMatch.js";
import type { CandidateWeights, OpponentClass } from "./ga/types.js";
import { ensureWorkDirs, readArchiveCandidates, resolveCandidateReference, writeDiagnosticsManifest } from "./ga/io.js";
import type { TurnDiagnosticsRecord } from "./bot/diagnostics.js";

type OpponentMode = "mirror" | "archive" | "elite";
type SeatMode = 0 | 1 | "both";

interface DiagnosticsManifest {
  runId: string;
  startedAt: string;
  completedAt?: string;
  focus: {
    candidateId: string;
    weightsFile: string;
  };
  opponentMode: OpponentMode;
  opponentId: string | null;
  seeds: number[];
  topN: number;
  turnLimit: number | null;
  seats: Array<0 | 1>;
  matches: Array<{
    seed: number;
    seat: 0 | 1;
    artifactFile: string;
  }>;
}

interface MatchDiagnosticsArtifact {
  runId: string;
  seed: number;
  seat: 0 | 1;
  candidate: {
    id: string;
    weightsFile: string;
    playerSlot: 1 | 2;
  };
  opponent: {
    id: string;
    weightsFile: string;
    playerSlot: 1 | 2;
    opponentClass: OpponentClass;
  };
  matchSummary: MatchSummary;
  focusSummary: {
    scoreDelta: number;
    win: boolean;
    draw: boolean;
  };
  players: PlayerDiagnosticsSummary[];
}

interface PlayerDiagnosticsSummary {
  playerSlot: 1 | 2;
  playerIndex: number;
  candidateId: string;
  turnCount: number;
  applesEaten: number;
  beheadCount: number;
  deathCount: number;
  outOfBoundsCount: number;
  totalFallDistance: number;
  decisionReviewTurns: Array<{
    turn: number;
    score: number;
    command: string;
    reasons: string[];
  }>;
  turns: TurnDiagnosticsRecord[];
}

async function main(): Promise<void> {
  ensureWorkDirs();
  const runId = new Date().toISOString().replaceAll(":", "-");
  const weightsFile = getFlagValue("--weights-file");
  const candidateId = getFlagValue("--candidate-id")
    ?? (weightsFile ? path.basename(weightsFile, path.extname(weightsFile)) : undefined);
  if (!candidateId) {
    throw new Error("Provide --candidate-id or --weights-file");
  }
  const candidate = resolveCandidateReference(candidateId, weightsFile);
  const opponentMode = (getFlagValue("--opponent-mode") ?? "mirror") as OpponentMode;
  const opponentId = getFlagValue("--opponent-id");
  const opponent = resolveOpponent(opponentMode, opponentId, candidate);
  const seeds = readSeeds();
  const topN = parsePositiveInt(getFlagValue("--top-n")) ?? 3;
  const turnLimit = parsePositiveInt(getFlagValue("--turn-limit"));
  const seatMode = readSeatMode();
  const seats = seatMode === "both" ? [0, 1] as const : [seatMode] as const;
  const manifest: DiagnosticsManifest = {
    runId,
    startedAt: new Date().toISOString(),
    focus: {
      candidateId: candidate.id,
      weightsFile: candidate.filePath,
    },
    opponentMode,
    opponentId: opponent.id,
    seeds,
    topN,
    turnLimit,
    seats: [...seats],
    matches: [],
  };
  writeDiagnosticsManifest(runId, manifest);

  for (const seed of seeds) {
    for (const seat of seats) {
      const artifactFile = await runDiagnosticsMatch(runId, seed, seat, topN, turnLimit, candidate, opponent, opponentMode);
      manifest.matches.push({
        seed,
        seat,
        artifactFile,
      });
      writeDiagnosticsManifest(runId, manifest);
    }
  }

  manifest.completedAt = new Date().toISOString();
  writeDiagnosticsManifest(runId, manifest);
  process.stdout.write(`Diagnostics run saved to .snakebyte/diagnostics/${runId}\n`);
}

async function runDiagnosticsMatch(
  runId: string,
  seed: number,
  seat: 0 | 1,
  topN: number,
  turnLimit: number | null,
  candidate: { id: string; filePath: string; weights: CandidateWeights },
  opponent: { id: string; filePath: string; weights: CandidateWeights },
  opponentMode: OpponentMode,
): Promise<string> {
  const matchId = `seed-${seed}-seat-${seat}`;
  const workDir = path.resolve(process.cwd(), ".snakebyte", "diagnostics", runId, "raw", matchId);
  fs.mkdirSync(workDir, { recursive: true });

  const player1File = path.join(workDir, "player1.jsonl");
  const player2File = path.join(workDir, "player2.jsonl");
  const player1 = seat === 0 ? candidate : opponent;
  const player2 = seat === 0 ? opponent : candidate;
  const result = await runMatch({
    engineDir: defaultExperimentConfig.engineDir,
    player1Command: buildDiagnosticsCommand(player1.filePath, player1File, topN, turnLimit),
    player2Command: buildDiagnosticsCommand(player2.filePath, player2File, topN, turnLimit),
    seed,
    simulate: true,
  }, { quiet: true });

  if (!result.summary) {
    throw new Error(`Missing match summary for diagnostics seed=${seed} seat=${seat}`);
  }

  const artifact = buildMatchArtifact(
    runId,
    seed,
    seat,
    candidate,
    opponent,
    opponentMode === "mirror" ? "mirror" : opponentMode,
    result,
    player1File,
    player2File,
  );
  const artifactFile = path.resolve(process.cwd(), ".snakebyte", "diagnostics", runId, `${matchId}.json`);
  fs.writeFileSync(artifactFile, JSON.stringify(artifact, null, 2));
  return artifactFile;
}

function buildMatchArtifact(
  runId: string,
  seed: number,
  seat: 0 | 1,
  candidate: { id: string; filePath: string },
  opponent: { id: string; filePath: string },
  opponentClass: OpponentClass,
  result: MatchCommandResult,
  player1File: string,
  player2File: string,
): MatchDiagnosticsArtifact {
  const summary = result.summary;
  if (!summary) {
    throw new Error("Missing summary while building diagnostics artifact");
  }

  const candidatePlayerSlot = seat === 0 ? 1 : 2;
  const opponentPlayerSlot = candidatePlayerSlot === 1 ? 2 : 1;
  const focusScore = candidatePlayerSlot === 1 ? summary.player1Score : summary.player2Score;
  const opponentScore = candidatePlayerSlot === 1 ? summary.player2Score : summary.player1Score;

  return {
    runId,
    seed,
    seat,
    candidate: {
      id: candidate.id,
      weightsFile: candidate.filePath,
      playerSlot: candidatePlayerSlot,
    },
    opponent: {
      id: opponent.id,
      weightsFile: opponent.filePath,
      playerSlot: opponentPlayerSlot,
      opponentClass,
    },
    matchSummary: summary,
    focusSummary: {
      scoreDelta: focusScore - opponentScore,
      win: focusScore > opponentScore,
      draw: focusScore === opponentScore,
    },
    players: [
      summarizePlayerDiagnostics(1, player1File, seat === 0 ? candidate.id : opponent.id),
      summarizePlayerDiagnostics(2, player2File, seat === 0 ? opponent.id : candidate.id),
    ],
  };
}

function summarizePlayerDiagnostics(
  playerSlot: 1 | 2,
  filePath: string,
  candidateId: string,
): PlayerDiagnosticsSummary {
  const turns = readTurnRecords(filePath);
  const chosenEvents = turns.flatMap((turn) => turn.chosen.events);
  const applesEaten = countKinds(chosenEvents, "eat");
  const beheadCount = countKinds(chosenEvents, "behead");
  const deathCount = countKinds(chosenEvents, "die");
  const outOfBoundsCount = countKinds(chosenEvents, "outOfBounds");
  const totalFallDistance = chosenEvents
    .filter((event) => event.kind === "fall")
    .reduce((total, event) => total + (event.amount ?? 0), 0);

  return {
    playerSlot,
    playerIndex: turns[0]?.playerIndex ?? playerSlot - 1,
    candidateId,
    turnCount: turns.length,
    applesEaten,
    beheadCount,
    deathCount,
    outOfBoundsCount,
    totalFallDistance,
    decisionReviewTurns: turns
      .map((turn) => ({
        turn: turn.turn,
        score: turn.chosen.score,
        command: turn.command,
        reasons: reviewReasons(turn),
      }))
      .filter((entry) => entry.reasons.length > 0)
      .slice(0, 12),
    turns,
  };
}

function reviewReasons(turn: TurnDiagnosticsRecord): string[] {
  const reasons: string[] = [];
  const eventKinds = new Set(turn.chosen.events.map((event) => event.kind));

  if (eventKinds.has("die")) {
    reasons.push("dies immediately");
  }
  if (eventKinds.has("behead")) {
    reasons.push("beheaded on simulated turn");
  }
  if (eventKinds.has("outOfBounds")) {
    reasons.push("falls out of bounds");
  }
  if (turn.chosen.features.survivalAfterFall < 1) {
    reasons.push("post-fall survival loss");
  }
  if (turn.chosen.features.selfCollisionRisk > 0) {
    reasons.push("self collision risk triggered");
  }
  if (turn.chosen.features.outOfBoundsRisk > 0) {
    reasons.push("out-of-bounds risk triggered");
  }
  if (turn.scoreGapToSecond !== null && turn.scoreGapToSecond < 5) {
    reasons.push("low confidence choice");
  }

  return reasons;
}

function readTurnRecords(filePath: string): TurnDiagnosticsRecord[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TurnDiagnosticsRecord);
}

function countKinds(events: Array<{ kind: string }>, kind: string): number {
  return events.filter((event) => event.kind === kind).length;
}

function buildDiagnosticsCommand(weightsFile: string, diagnosticsFile: string, topN: number, turnLimit: number | null): string {
  const limitPart = turnLimit === null ? "" : ` --diagnostics-turn-limit ${turnLimit}`;
  return [
    heuristicBotCommand(),
    `--weights-file ${normalizeCommandPath(path.relative(process.cwd(), weightsFile))}`,
    `--diagnostics-file ${normalizeCommandPath(diagnosticsFile)}`,
    `--diagnostics-top-n ${topN}`,
    limitPart.trim(),
  ].filter(Boolean).join(" ");
}

function heuristicBotCommand(): string {
  const builtBot = path.resolve(process.cwd(), "dist", "bot", "cli.js");
  if (fs.existsSync(builtBot)) {
    return "node dist/bot/cli.js";
  }

  return "node --import tsx src/bot/cli.ts";
}

function resolveOpponent(
  opponentMode: OpponentMode,
  opponentId: string | undefined,
  candidate: { id: string; filePath: string; weights: CandidateWeights },
): { id: string; filePath: string; weights: CandidateWeights } {
  if (opponentMode === "mirror") {
    return candidate;
  }

  if (opponentMode === "archive") {
    if (opponentId) {
      return resolveCandidateReference(opponentId);
    }

    const archive = readArchiveCandidates(1).find((entry) => entry.id !== candidate.id);
    if (!archive) {
      throw new Error("No archived candidate available for diagnostics");
    }
    return resolveCandidateReference(archive.id);
  }

  if (opponentId) {
    return resolveCandidateReference(opponentId);
  }

  const elite = readArchiveCandidates(8).find((entry) => entry.id !== candidate.id);
  if (!elite) {
    throw new Error("No elite candidate available for diagnostics");
  }
  return resolveCandidateReference(elite.id);
}

function readSeeds(): number[] {
  const seeds = getFlagValue("--seeds");
  if (!seeds) {
    return [...defaultExperimentConfig.seedSet];
  }

  const parsed = seeds
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry));
  return parsed.length > 0 ? parsed : [...defaultExperimentConfig.seedSet];
}

function readSeatMode(): SeatMode {
  const value = getFlagValue("--seat");
  if (!value || value === "both") {
    return "both";
  }
  if (value === "0" || value === "1") {
    return Number(value) as 0 | 1;
  }
  return "both";
}

function getFlagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCommandPath(value: string): string {
  return value.replaceAll("\\", "/");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
