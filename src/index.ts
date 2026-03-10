import { defaultExperimentConfig } from "./config.js";
import { createRandomPopulation } from "./ga/randomSearch.js";
import { buildLocalRunnerArgs, buildLocalRunnerCommand } from "./engine/localRunner.js";

function main(): void {
  const population = createRandomPopulation(
    defaultExperimentConfig.populationSize,
    defaultExperimentConfig.weightKeys,
  );
  const engineCommand = buildLocalRunnerCommand({
    engineDir: defaultExperimentConfig.engineDir,
    player1Command: "node dist/bot/cli.js",
    player2Command: "python engine/config/Boss.py",
    seed: 1,
    port: 8888,
  });

  console.log("Experiment scaffold ready.");
  console.log(`Population size: ${population.length}`);
  console.log(`Engine path: ${defaultExperimentConfig.engineDir}`);
  console.log(`Runner: ${engineCommand.command} ${buildLocalRunnerArgs(engineCommand.options).join(" ")}`);
}

main();
