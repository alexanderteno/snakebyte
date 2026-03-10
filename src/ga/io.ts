import fs from "node:fs";
import path from "node:path";
import type { Candidate, CandidateWeights, GenerationSummary, RunManifest, TournamentResult } from "./types.js";

const WORK_DIR = path.resolve(process.cwd(), ".snakebyte");
const WEIGHTS_DIR = path.join(WORK_DIR, "weights");
const RUNS_DIR = path.join(WORK_DIR, "runs");
const ARCHIVE_DIR = path.join(WORK_DIR, "archive");
const GENERATIONS_DIR = path.join(WORK_DIR, "generations");

export function ensureWorkDirs(): void {
  fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.mkdirSync(GENERATIONS_DIR, { recursive: true });
}

export function writeCandidateWeights(candidate: Candidate): string {
  ensureWorkDirs();
  const filePath = path.join(WEIGHTS_DIR, `${candidate.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(candidate.weights, null, 2));
  return filePath;
}

export function writeWeightsFile(candidateId: string, weights: CandidateWeights): string {
  ensureWorkDirs();
  const filePath = path.join(WEIGHTS_DIR, `${candidateId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(weights, null, 2));
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
            averageScoreDelta: ranking.averageScoreDelta,
            winRate: ranking.winRate,
            drawRate: ranking.drawRate,
            lossRate: ranking.lossRate,
            averageNonDrawMargin: ranking.averageNonDrawMargin,
          },
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
  fs.writeFileSync(filePath, JSON.stringify(candidate.weights, null, 2));
  return filePath;
}
