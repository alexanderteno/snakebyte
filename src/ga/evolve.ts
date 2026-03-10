import { defaultExperimentConfig } from "../config.js";
import type { Candidate, TournamentResult } from "./types.js";
import { evaluateCandidateAgainstPool } from "./evaluate.js";
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

  let population = createRandomPopulation(
    populationSize,
    defaultExperimentConfig.weightKeys,
  );
  const archive: Candidate[] = [];
  const history: GenerationResult[] = [];

  for (let generation = 0; generation < maxGenerations; generation += 1) {
    const opponentPool = buildOpponentPool(population, archive);
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
    archive.splice(12);

    population = repopulate(elites, populationSize);
  }

  return history;
}

function buildOpponentPool(population: Candidate[], archive: Candidate[]): Candidate[] {
  const currentElites = [...population].slice(0, Math.min(3, population.length));
  const archived = archive.slice(0, 3);
  return [...currentElites, ...archived].filter(uniqueCandidates);
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

function uniqueCandidates(candidate: Candidate, index: number, candidates: Candidate[]): boolean {
  return candidates.findIndex((entry) => entry.id === candidate.id) === index;
}
