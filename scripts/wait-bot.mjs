import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let initialized = false;
let height = 0;
let birdsPerPlayer = 0;
let linesRemaining = 0;
let headerLine = 0;

rl.on("line", (line) => {
  if (!initialized) {
    headerLine += 1;
    if (headerLine === 3) {
      return;
    }
    if (headerLine === 4) {
      height = Number(line);
      linesRemaining = height;
      return;
    }
    if (linesRemaining > 0) {
      linesRemaining -= 1;
      return;
    }
    if (birdsPerPlayer === 0) {
      birdsPerPlayer = Number(line);
      linesRemaining = birdsPerPlayer * 2;
      return;
    }
    if (linesRemaining > 0) {
      linesRemaining -= 1;
      if (linesRemaining === 0) {
        initialized = true;
      }
      return;
    }
  }

  process.stdout.write("WAIT\n");
});
