import fs from "node:fs";
import path from "node:path";
import { normalizeWeights } from "../bot/weights.js";
import type { Candidate, CandidateWeights, GenerationSummary, RunManifest, TournamentResult } from "./types.js";

const WORK_DIR = path.resolve(process.cwd(), ".snakebyte");
const WEIGHTS_DIR = path.join(WORK_DIR, "weights");
const RUNS_DIR = path.join(WORK_DIR, "runs");
const ARCHIVE_DIR = path.join(WORK_DIR, "archive");
const GENERATIONS_DIR = path.join(WORK_DIR, "generations");
const DIAGNOSTICS_DIR = path.join(WORK_DIR, "diagnostics");

export function ensureWorkDirs(): void {
  fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.mkdirSync(GENERATIONS_DIR, { recursive: true });
  fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
}

export function writeCandidateWeights(candidate: Candidate): string {
  ensureWorkDirs();
  const filePath = path.join(WEIGHTS_DIR, `${candidate.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(normalizeWeights(candidate.weights), null, 2));
  return filePath;
}

export function writeWeightsFile(candidateId: string, weights: CandidateWeights): string {
  ensureWorkDirs();
  const filePath = path.join(WEIGHTS_DIR, `${candidateId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(normalizeWeights(weights), null, 2));
  return filePath;
}

export function createRunManifest(manifest: RunManifest): string {
  ensureWorkDirs();
  const runDir = path.join(RUNS_DIR, manifest.runId);
  fs.mkdirSync(runDir, { recursive: true });
  const filePath = path.join(runDir, "manifest.json");
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  return filePath;
}

export function updateRunManifest(runId: string, update: Partial<RunManifest>): string {
  ensureWorkDirs();
  const filePath = path.join(RUNS_DIR, runId, "manifest.json");
  const currentManifest = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8")) as RunManifest
    : { runId } as RunManifest;
  const nextManifest = { ...currentManifest, ...update };
  fs.writeFileSync(filePath, JSON.stringify(nextManifest, null, 2));
  return filePath;
}

export function writeGenerationSummary(runId: string, summary: GenerationSummary): string {
  ensureWorkDirs();
  const runDir = path.join(RUNS_DIR, runId, "generations");
  fs.mkdirSync(runDir, { recursive: true });
  const filePath = path.join(runDir, `${String(summary.generation).padStart(3, "0")}.json`);
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
  const latestFilePath = path.join(GENERATIONS_DIR, `${runId}-${String(summary.generation).padStart(3, "0")}.json`);
  fs.writeFileSync(latestFilePath, JSON.stringify(summary, null, 2));
  return filePath;
}

export function writeGenerationTopCandidates(
  runId: string,
  generation: number,
  candidates: Array<{ candidate: Candidate; ranking: TournamentResult }>,
): string[] {
  ensureWorkDirs();
  const runDir = path.join(RUNS_DIR, runId, "candidates", String(generation).padStart(3, "0"));
  fs.mkdirSync(runDir, { recursive: true });
  return candidates.map(({ candidate, ranking }) => {
    const filePath = path.join(runDir, `${candidate.id}.json`);
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          candidateId: candidate.id,
          weights: candidate.weights,
          metrics: {
            fitness: ranking.fitness,
            averageScoreDelta: ranking.averageScoreDelta,
            winRate: ranking.winRate,
            drawRate: ranking.drawRate,
            lossRate: ranking.lossRate,
            averageNonDrawMargin: ranking.averageNonDrawMargin,
            scoreDeltaStdDev: ranking.scoreDeltaStdDev,
          },
          byOpponentClass: ranking.byOpponentClass,
          bySeed: ranking.bySeed,
          matches: ranking.matches,
        },
        null,
        2,
      ),
    );
    return filePath;
  });
}

export function archiveCandidate(candidate: Candidate): string {
  ensureWorkDirs();
  const filePath = path.join(ARCHIVE_DIR, `${candidate.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(normalizeWeights(candidate.weights), null, 2));
  return filePath;
}

export function readArchiveCandidates(limit = 12): Candidate[] {
  ensureWorkDirs();
  return fs.readdirSync(ARCHIVE_DIR)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const filePath = path.join(ARCHIVE_DIR, fileName);
      const stats = fs.statSync(filePath);
      return {
        filePath,
        id: path.basename(fileName, ".json"),
        weights: normalizeWeights(JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<CandidateWeights>),
        modifiedTime: stats.mtimeMs,
      };
    })
    .sort((left, right) => right.modifiedTime - left.modifiedTime)
    .slice(0, limit)
    .map(({ id, weights, filePath }) => ({ id, weights, filePath }))
    .map(({ id, weights }) => ({ id, weights }));
}

export function resolveCandidateReference(candidateId: string, explicitWeightsFile?: string): { id: string; filePath: string; weights: CandidateWeights } {
  ensureWorkDirs();
  if (explicitWeightsFile) {
    const filePath = path.resolve(process.cwd(), explicitWeightsFile);
    return {
      id: candidateId,
      filePath,
      weights: normalizeWeights(JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<CandidateWeights>),
    };
  }

  const candidateFile = [
    path.join(WEIGHTS_DIR, `${candidateId}.json`),
    path.join(ARCHIVE_DIR, `${candidateId}.json`),
  ].find((filePath) => fs.existsSync(filePath));

  if (!candidateFile) {
    throw new Error(`Unable to resolve candidate weights for ${candidateId}`);
  }

  return {
    id: candidateId,
    filePath: candidateFile,
    weights: normalizeWeights(JSON.parse(fs.readFileSync(candidateFile, "utf8")) as Partial<CandidateWeights>),
  };
}

export function writeDiagnosticsManifest<T>(runId: string, manifest: T): string {
  ensureWorkDirs();
  const runDir = path.join(DIAGNOSTICS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const filePath = path.join(runDir, "manifest.json");
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  return filePath;
}
