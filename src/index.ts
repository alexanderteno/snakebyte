import { defaultExperimentConfig } from "./config.js";
import { buildLocalRunnerArgs, buildLocalRunnerCommand } from "./engine/localRunner.js";
import { runEvolution, type EvolutionOptions } from "./ga/evolve.js";

async function main(): Promise<void> {
  const evolutionOptions = readEvolutionOptions();
  const engineCommand = buildLocalRunnerCommand({
    engineDir: defaultExperimentConfig.engineDir,
    player1Command: "node dist/bot/cli.js",
    player2Command: defaultExperimentConfig.sparringCommand,
    seed: 1,
    port: 8888,
  });

  console.log("Evolution harness ready.");
  console.log(`Population size: ${evolutionOptions.populationSize ?? defaultExperimentConfig.populationSize}`);
  console.log(`Engine path: ${defaultExperimentConfig.engineDir}`);
  console.log(`Runner: ${engineCommand.command} ${buildLocalRunnerArgs(engineCommand.options).join(" ")}`);
  console.log(`Seed set: ${(evolutionOptions.seedSet ?? defaultExperimentConfig.seedSet).join(", ")}`);

  if (process.argv.includes("--run-evolution")) {
    const history = await runEvolution(evolutionOptions);
    const lastGeneration = history.at(-1);
    if (lastGeneration) {
      console.log(`Completed ${history.length} generations.`);
      const best = lastGeneration.rankings[0];
      if (best) {
        console.log(
          `Best candidate: id=${best.candidateId} delta=${best.averageScoreDelta.toFixed(2)} win=${best.winRate.toFixed(2)} draw=${best.drawRate.toFixed(2)} loss=${best.lossRate.toFixed(2)} margin=${best.averageNonDrawMargin.toFixed(2)}`,
        );
      }
    }
  }
}

function readEvolutionOptions(): EvolutionOptions {
  const evolutionOptions: EvolutionOptions = {};
  const populationSize = parseNumberFlag("--population");
  const maxGenerations = parseNumberFlag("--generations");

  if (populationSize !== undefined) {
    evolutionOptions.populationSize = populationSize;
  }
  if (maxGenerations !== undefined) {
    evolutionOptions.maxGenerations = maxGenerations;
  }
  if (process.argv.includes("--smoke-seeds")) {
    evolutionOptions.seedSet = [defaultExperimentConfig.seedSet[0] ?? 1];
  }

  return evolutionOptions;
}

function parseNumberFlag(flag: string): number | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const rawValue = process.argv[index + 1];
  if (!rawValue) {
    return undefined;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : undefined;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
