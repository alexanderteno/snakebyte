import type { CandidateWeights } from "../ga/types.js";
import { parseFrameState, parseGlobalState } from "../bot/protocol.js";
import { chooseContestCommand } from "./policy.js";

declare const __SNAKEBYTE_SUBMISSION_WEIGHTS__: CandidateWeights;

function readContestLine(): string {
  const reader = (globalThis as { readline?: () => string }).readline;
  if (typeof reader !== "function") {
    throw new Error("Contest runtime does not provide readline()");
  }

  return reader();
}

function writeContestLine(value: string): void {
  if (typeof console?.log === "function") {
    console.log(value);
    return;
  }

  const writer = (globalThis as { print?: (message: string) => void }).print;
  if (typeof writer === "function") {
    writer(value);
  }
}

function main(): void {
  const playerIndex = readContestLine();
  const width = readContestLine();
  const height = readContestLine();
  const rows = Array.from({ length: Number(height) }, () => readContestLine());
  const birdsPerPlayer = readContestLine();
  const idCount = Number(birdsPerPlayer) * 2;
  const ids = Array.from({ length: idCount }, () => readContestLine());
  const globalState = parseGlobalState([
    playerIndex,
    width,
    height,
    ...rows,
    birdsPerPlayer,
    ...ids,
  ]);

  while (true) {
    const appleCountLine = readContestLine();
    const appleCount = Number(appleCountLine);
    const apples = Array.from({ length: appleCount }, () => readContestLine());
    const birdCountLine = readContestLine();
    const birdCount = Number(birdCountLine);
    const birds = Array.from({ length: birdCount }, () => readContestLine());
    const frameState = parseFrameState([
      appleCountLine,
      ...apples,
      birdCountLine,
      ...birds,
    ]);

    const command = chooseContestCommand(globalState, frameState, __SNAKEBYTE_SUBMISSION_WEIGHTS__);
    writeContestLine(command);
  }
}

main();
