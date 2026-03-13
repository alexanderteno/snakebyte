import { runMatch } from "../dist/engine/runMatch.js";

const seed = Number(process.argv[2]);
const weightsFile = process.argv[3];
const opponentCommand = process.argv[4];

if (!Number.isFinite(seed) || !weightsFile) {
  process.stderr.write("Usage: node scripts/repro-seed-perf.mjs <seed> <weights-file> [opponent-command]\n");
  process.exit(1);
}

const candidateCommand = `node dist/bot/cli.js --weights-file ${weightsFile}`;
const result = await runMatch({
  engineDir: "./engine",
  player1Command: candidateCommand,
  player2Command: opponentCommand ?? candidateCommand,
  seed,
  simulate: true,
}, { quiet: true });

const perfLines = [
  ...result.stderr
    .split(/\r?\n/)
    .filter((line) => line.includes("\"type\":\"perf\"")),
  ...Object.values(result.summary?.errors ?? {})
    .flat()
    .filter((line) => line.includes("\"type\":\"perf\"")),
];

process.stdout.write(`${JSON.stringify({
  summary: result.summary,
  perfLines,
}, null, 2)}\n`);
