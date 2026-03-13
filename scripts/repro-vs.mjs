import { runMatch } from "../dist/engine/runMatch.js";

const seed = Number(process.argv[2]);
const player1Command = process.argv[3];
const player2Command = process.argv[4];

if (!Number.isFinite(seed) || !player1Command || !player2Command) {
  process.stderr.write("Usage: node scripts/repro-vs.mjs <seed> <player1-command> <player2-command>\n");
  process.exit(1);
}

const result = await runMatch({
  engineDir: "./engine",
  player1Command,
  player2Command,
  seed,
  simulate: true,
});

process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
