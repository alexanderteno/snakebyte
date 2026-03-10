import { defaultExperimentConfig } from "./config.js";
import { createRandomPopulation } from "./ga/randomSearch.js";

function main(): void {
  const population = createRandomPopulation(
    defaultExperimentConfig.populationSize,
    defaultExperimentConfig.weightKeys,
  );

  console.log("Experiment scaffold ready.");
  console.log(`Population size: ${population.length}`);
  console.log(`Engine path: ${defaultExperimentConfig.engineDir}`);
}

main();

