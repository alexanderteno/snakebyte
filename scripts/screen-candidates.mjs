import { defaultExperimentConfig } from "../dist/config.js";
import { runMatch } from "../dist/engine/runMatch.js";

const ids = process.argv.slice(2);
const timeoutSeeds = defaultExperimentConfig.timeoutSeedSet;
const passiveSeeds = defaultExperimentConfig.passiveSeedSet;

if (ids.length === 0) {
  process.stderr.write("Usage: node scripts/screen-candidates.mjs <candidate-id> [candidate-id...]\n");
  process.exit(1);
}

for (const id of ids) {
  const weights = `.snakebyte/archive/${id}.json`;
  const timeoutResults = [];
  for (const seed of timeoutSeeds) {
    const result = await runMatch({
      engineDir: "./engine",
      player1Command: `node dist/bot/cli.js --weights-file ${weights}`,
      player2Command: `node dist/bot/cli.js --weights-file ${weights}`,
      seed,
      simulate: true,
    }, { quiet: true });
    timeoutResults.push({
      seed,
      summary: result.summary,
    });
  }
  const passiveResults = [];

  for (const seed of passiveSeeds) {
    const result = await runMatch({
      engineDir: "./engine",
      player1Command: `node dist/bot/cli.js --weights-file ${weights}`,
      player2Command: "node scripts/wait-bot.mjs",
      seed,
      simulate: true,
    }, { quiet: true });
    passiveResults.push({
      seed,
      summary: result.summary,
    });
  }

  process.stdout.write(`${JSON.stringify({
    id,
    timeoutSeeds: timeoutResults,
    passiveSeeds: passiveResults,
  })}\n`);
}
