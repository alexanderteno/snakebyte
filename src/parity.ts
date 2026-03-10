import { runParityChecks } from "./bot/parity.js";

const result = runParityChecks();

process.stdout.write(`Parity summary: passed=${result.passed} failed=${result.failed}\n`);
if (result.failed > 0) {
  process.exitCode = 1;
}
