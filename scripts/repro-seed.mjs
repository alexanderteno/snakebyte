import { runMatch } from "../dist/engine/runMatch.js";

const seed = Number(process.argv[2]);
const weightsFile = process.argv[3];

if (!Number.isFinite(seed) || !weightsFile) {
  process.stderr.write("Usage: node scripts/repro-seed.mjs <seed> <weights-file>\n");
  process.exit(1);
}

const command = `node dist/bot/cli.js --weights-file ${weightsFile}`;
const result = await runMatch({
  engineDir: "./engine",
  player1Command: command,
  player2Command: command,
  seed,
  simulate: true,
});

process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
