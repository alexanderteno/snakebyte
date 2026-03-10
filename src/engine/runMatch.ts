import { spawn } from "node:child_process";
import type { LocalRunnerOptions } from "./localRunner.js";
import { buildLocalRunnerCommand } from "./localRunner.js";

export interface MatchCommandResult {
  exitCode: number | null;
}

export async function runMatch(options: LocalRunnerOptions): Promise<MatchCommandResult> {
  const command = buildLocalRunnerCommand(options);

  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      stdio: "inherit",
      shell: false,
    });

    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode }));
  });
}
