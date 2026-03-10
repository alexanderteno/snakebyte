import fs from "node:fs";
import path from "node:path";
import { defaultExperimentConfig } from "./config.js";
import { runMatch } from "./engine/runMatch.js";

function heuristicBotCommand(): string {
  const builtBot = path.resolve(process.cwd(), "dist", "bot", "cli.js");
  if (fs.existsSync(builtBot)) {
    return "node dist/bot/cli.js";
  }

  return "node --import tsx src/bot/cli.ts";
}

function player1Command(): string {
  if (process.argv.includes("--starter-bot")) {
    return "node --import tsx starter-runner.ts";
  }

  return heuristicBotCommand();
}

function player2Command(): string {
  if (process.argv.includes("--opponent-starter")) {
    return "node --import tsx starter-runner.ts";
  }

  if (process.argv.includes("--mirror-bot")) {
    return heuristicBotCommand();
  }

  return defaultExperimentConfig.sparringCommand;
}

async function main(): Promise<void> {
  const result = await runMatch({
    engineDir: path.resolve(process.cwd(), "engine"),
    player1Command: player1Command(),
    player2Command: player2Command(),
    seed: 1,
    port: 8888,
    simulate: true,
  });

  if (result.summary) {
    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  } else {
    process.stderr.write("Match completed without a parsed summary.\n");
  }

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode ?? 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
