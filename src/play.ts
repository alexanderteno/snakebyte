import path from "node:path";
import { defaultExperimentConfig } from "./config.js";
import { runMatch } from "./engine/runMatch.js";

function player1Command(): string {
  if (process.argv.includes("--starter-bot")) {
    return "node --import tsx starter-runner.ts";
  }

  return "node dist/bot/cli.js";
}

async function main(): Promise<void> {
  const result = await runMatch({
    engineDir: path.resolve(process.cwd(), "engine"),
    player1Command: player1Command(),
    player2Command: defaultExperimentConfig.sparringCommand,
    seed: 1,
    port: 8888,
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode ?? 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
