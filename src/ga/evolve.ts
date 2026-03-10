import { defaultExperimentConfig } from "../config.js";
import type { Candidate, GenerationSummary, RunManifest, TournamentResult } from "./types.js";
import { evaluateCandidateAgainstPool, type EvaluationOpponent } from "./evaluate.js";
import {
  archiveCandidate,
  createRunManifest,
  readArchiveCandidates,
  updateRunManifest,
  writeGenerationSummary,
  writeGenerationTopCandidates,
} from "./io.js";
import { mutateCandidate } from "./mutate.js";
import { createRandomPopulation } from "./randomSearch.js";

export interface GenerationResult {
  generation: number;
  rankings: TournamentResult[];
  elites: Candidate[];
}

export interface EvolutionOptions {
  populationSize?: number;
  maxGenerations?: number;
  seedSet?: number[];
}

export async function runEvolution(options: EvolutionOptions = {}): Promise<GenerationResult[]> {
  const populationSize = options.populationSize ?? defaultExperimentConfig.populationSize;
  const maxGenerations = options.maxGenerations ?? defaultExperimentConfig.maxGenerations;
  const seedSet = options.seedSet ?? defaultExperimentConfig.seedSet;
  const runId = new Date().toISOString().replaceAll(":", "-");

  let population = createRandomPopulation(
    populationSize,
    defaultExperimentConfig.weightKeys,
  );
  const archive: Candidate[] = readArchiveCandidates(defaultExperimentConfig.archiveSize);
  let previousElites: Candidate[] = [];
  const history: GenerationResult[] = [];
  createRunManifest({
    runId,
    startedAt: new Date().toISOString(),
    seedSet,
    populationSize,
    eliteCount: defaultExperimentConfig.eliteCount,
    maxGenerations,
    generationTopCount: defaultExperimentConfig.generationTopCount,
    bestCandidateIds: [],
  });

  for (let generation = 0; generation < maxGenerations; generation += 1) {
    const opponentPool = buildOpponentPool(previousElites, archive);
    const rankings = await Promise.all(
      population.map((candidate) => evaluateCandidateAgainstPool(candidate, opponentPool, seedSet)),
    );
    rankings.sort(compareTournamentResults);

    const elites = rankings
      .slice(0, defaultExperimentConfig.eliteCount)
      .map((result) => population.find((candidate) => candidate.id === result.candidateId))
      .filter((candidate): candidate is Candidate => candidate !== undefined);

    history.push({ generation, rankings, elites });
    archive.unshift(...elites);
    archive.splice(defaultExperimentConfig.archiveSize);
    for (const elite of elites) {
      archiveCandidate(elite);
    }
    const summary = buildGenerationSummary(generation, rankings, archive);
    writeGenerationSummary(runId, summary);
    writeGenerationTopCandidates(
      runId,
      generation,
      summary.topCandidates
        .map((entry) => {
          const candidate = population.find((item) => item.id === entry.candidateId);
          const ranking = rankings.find((item) => item.candidateId === entry.candidateId);
          return candidate && ranking ? { candidate, ranking } : null;
        })
        .filter((entry): entry is { candidate: Candidate; ranking: TournamentResult } => entry !== null),
    );
    updateRunManifest(runId, {
      bestCandidateIds: history.map((entry) => entry.rankings[0]?.candidateId).filter((entry): entry is string => Boolean(entry)),
    });
    logGenerationSummary(summary);
    previousElites = elites;

    population = repopulate(elites, populationSize);
  }

  updateRunManifest(runId, { completedAt: new Date().toISOString() });

  return history;
}

function buildOpponentPool(previousElites: Candidate[], archive: Candidate[]): EvaluationOpponent[] {
  const archived = archive.slice(0, Math.min(archive.length, 6)).map((candidate) => ({ candidate, opponentClass: "archive" as const }));
  const elites = previousElites.map((candidate) => ({ candidate, opponentClass: "elite" as const }));
  return [...elites, ...archived].filter(uniqueOpponents);
}

function repopulate(elites: Candidate[], populationSize: number): Candidate[] {
  const seedElites = elites.length > 0
    ? elites
    : createRandomPopulation(defaultExperimentConfig.eliteCount, defaultExperimentConfig.weightKeys);
  const nextPopulation: Candidate[] = [...seedElites];
  while (nextPopulation.length < populationSize) {
    const parent = seedElites[nextPopulation.length % seedElites.length];
    if (!parent) {
      throw new Error("Missing elite parent during repopulation");
    }
    nextPopulation.push(mutateCandidate(parent));
  }
  return nextPopulation;
}

function compareTournamentResults(left: TournamentResult, right: TournamentResult): number {
  if (right.fitness !== left.fitness) {
    return right.fitness - left.fitness;
  }
  if (right.averageScoreDelta !== left.averageScoreDelta) {
    return right.averageScoreDelta - left.averageScoreDelta;
  }
  if (left.drawRate !== right.drawRate) {
    return left.drawRate - right.drawRate;
  }
  if (right.winRate !== left.winRate) {
    return right.winRate - left.winRate;
  }
  return right.averageNonDrawMargin - left.averageNonDrawMargin;
}

function buildGenerationSummary(generation: number, rankings: TournamentResult[], archive: Candidate[]): GenerationSummary {
  const best = rankings[0];
  return {
    generation,
    bestCandidateId: best?.candidateId ?? null,
    fitness: best?.fitness ?? 0,
    averageScoreDelta: best?.averageScoreDelta ?? 0,
    winRate: best?.winRate ?? 0,
    drawRate: best?.drawRate ?? 0,
    lossRate: best?.lossRate ?? 0,
    averageNonDrawMargin: best?.averageNonDrawMargin ?? 0,
    scoreDeltaStdDev: best?.scoreDeltaStdDev ?? 0,
    archiveSnapshot: archive.slice(0, defaultExperimentConfig.archiveSize).map((candidate) => candidate.id),
    topCandidates: rankings.slice(0, defaultExperimentConfig.generationTopCount).map((result) => ({
      candidateId: result.candidateId,
      fitness: result.fitness,
      averageScoreDelta: result.averageScoreDelta,
      winRate: result.winRate,
      drawRate: result.drawRate,
      lossRate: result.lossRate,
      averageNonDrawMargin: result.averageNonDrawMargin,
      scoreDeltaStdDev: result.scoreDeltaStdDev,
    })),
  };
}

function logGenerationSummary(summary: GenerationSummary): void {
  process.stdout.write(
    `gen=${summary.generation} best=${summary.bestCandidateId} fitness=${summary.fitness.toFixed(2)} delta=${summary.averageScoreDelta.toFixed(2)} win=${summary.winRate.toFixed(2)} draw=${summary.drawRate.toFixed(2)} margin=${summary.averageNonDrawMargin.toFixed(2)} std=${summary.scoreDeltaStdDev.toFixed(2)}\n`,
  );
}

function uniqueCandidates(candidate: Candidate, index: number, candidates: Candidate[]): boolean {
  return candidates.findIndex((entry) => entry.id === candidate.id) === index;
}

function uniqueOpponents(entry: EvaluationOpponent, index: number, values: EvaluationOpponent[]): boolean {
  return values.findIndex((candidateEntry) => candidateEntry.candidate.id === entry.candidate.id) === index;
}
