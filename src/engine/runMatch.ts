import { spawn } from "node:child_process";
import type { LocalRunnerOptions } from "./localRunner.js";
import { buildLocalRunnerCommand } from "./localRunner.js";

const RESULT_PREFIX = "MATCH_RESULT_JSON=";

export interface MatchAgentSummary {
  index: number;
  name: string;
}

export interface MatchSummary {
  seed: number | null;
  player1Command: string;
  player2Command: string;
  player1Score: number;
  player2Score: number;
  winnerIndex: number | null;
  failCause: string | null;
  summaries: string[];
  errors: Record<string, string[]>;
  agents: MatchAgentSummary[];
}

export interface MatchCommandResult {
  exitCode: number | null;
  summary: MatchSummary | null;
  stdout: string;
  stderr: string;
}

export async function runMatch(
  options: LocalRunnerOptions,
  runOptions: { quiet?: boolean } = {},
): Promise<MatchCommandResult> {
  const command = buildLocalRunnerCommand(options);
  const useShell = process.platform === "win32";

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: useShell,
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (!runOptions.quiet) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (!runOptions.quiet) {
        process.stderr.write(chunk);
      }
    });

    child.once("error", (error) => {
      reject(
        new Error(
          `Failed to launch match runner (${command.command}): ${error.message}`,
        ),
      );
    });
    child.once("close", (exitCode) =>
      resolve({
        exitCode,
        summary: extractSummary(stdout, stderr),
        stdout,
        stderr,
      }),
    );
  });
}

function extractSummary(stdout: string, stderr: string): MatchSummary | null {
  const combined = `${stdout}\n${stderr}`;
  const line = combined
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(RESULT_PREFIX));

  if (!line) {
    return null;
  }

  return JSON.parse(line.slice(RESULT_PREFIX.length)) as MatchSummary;
}
