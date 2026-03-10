import fs from "node:fs";
import path from "node:path";
import type { Candidate, CandidateWeights } from "./types.js";

const WORK_DIR = path.resolve(process.cwd(), ".snakebyte");
const WEIGHTS_DIR = path.join(WORK_DIR, "weights");

export function ensureWorkDirs(): void {
  fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
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
