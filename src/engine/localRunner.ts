import path from "node:path";

export interface LocalRunnerOptions {
  engineDir: string;
  player1Command: string;
  player2Command: string;
  seed?: number;
  port?: number;
}

export interface ShellCommand {
  cwd: string;
  command: string;
  args: string[];
  options: LocalRunnerOptions;
}

export function buildLocalRunnerArgs(options: LocalRunnerOptions): string[] {
  const args = [
    "-f",
    path.resolve(process.cwd(), "local-runner", "pom.xml"),
    "exec:java",
    `-Dexec.args=--engineDir "${options.engineDir}" --player1 "${options.player1Command}" --player2 "${options.player2Command}"`,
  ];

  if (options.seed !== undefined) {
    args[args.length - 1] += ` --seed ${options.seed}`;
  }

  if (options.port !== undefined) {
    args[args.length - 1] += ` --port ${options.port}`;
  }

  return args;
}

export function buildLocalRunnerCommand(options: LocalRunnerOptions): ShellCommand {
  return {
    cwd: process.cwd(),
    command: process.platform === "win32" ? "mvn.cmd" : "mvn",
    args: buildLocalRunnerArgs(options),
    options,
  };
}
