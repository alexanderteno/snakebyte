import path from "node:path";
import { spawn } from "node:child_process";

export interface EngineCommand {
  cwd: string;
  command: string;
  args: string[];
}

export function buildEngineCommand(engineDir: string): EngineCommand {
  const cwd = path.resolve(engineDir);

  return {
    cwd,
    command: "java",
    args: ["-version"],
  };
}

export async function runEngineCommand(engineDir: string): Promise<{ exitCode: number | null }> {
  const command = buildEngineCommand(engineDir);

  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      stdio: "ignore",
    });

    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode }));
  });
}

