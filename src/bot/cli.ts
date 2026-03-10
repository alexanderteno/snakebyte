import readline from "node:readline";
import { chooseCommand } from "./policy.js";
import { parseFrameState, parseGlobalState } from "./protocol.js";
import { loadWeights } from "./weights.js";

async function readLine(iterator: AsyncIterator<string>): Promise<string> {
  const next = await iterator.next();

  if (next.done || next.value === undefined) {
    throw new Error("stdin closed");
  }

  return next.value;
}

async function main(): Promise<void> {
  const weights = loadWeights(process.argv);
  const reader = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });
  const iterator = reader[Symbol.asyncIterator]();

  try {
    const playerIndex = await readLine(iterator);
    const width = await readLine(iterator);
    const height = await readLine(iterator);
    const rows = Array.from({ length: Number(height) }, async () => readLine(iterator));
    const birdsPerPlayer = await readLine(iterator);
    const idCount = Number(birdsPerPlayer) * 2;
    const ids = Array.from({ length: idCount }, async () => readLine(iterator));

    const globalState = parseGlobalState([
      playerIndex,
      width,
      height,
      ...(await Promise.all(rows)),
      birdsPerPlayer,
      ...(await Promise.all(ids)),
    ]);

    while (true) {
      const appleCountLine = await readLine(iterator);
      const appleCount = Number(appleCountLine);
      const apples = Array.from({ length: appleCount }, async () => readLine(iterator));
      const birdCountLine = await readLine(iterator);
      const birdCount = Number(birdCountLine);
      const birds = Array.from({ length: birdCount }, async () => readLine(iterator));

      const frameState = parseFrameState([
        appleCountLine,
        ...(await Promise.all(apples)),
        birdCountLine,
        ...(await Promise.all(birds)),
      ]);

      const command = chooseCommand(globalState, frameState, weights);
      process.stdout.write(`${command}\n`);
    }
  } finally {
    reader.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
