import path from "node:path";

export interface LocalRunnerOptions {
  engineDir: string;
  player1Command: string;
  player2Command: string;
  seed?: number;
  port?: number;
  simulate?: boolean;
}

export interface ShellCommand {
  cwd: string;
  command: string;
  args: string[];
  options: LocalRunnerOptions;
}

export function buildLocalRunnerArgs(options: LocalRunnerOptions): string[] {
  const args = [
    "-q",
    "-f",
    path.resolve(process.cwd(), "local-runner", "pom.xml"),
    "compile",
    "exec:java",
    `-Dexec.args=--engineDir "${options.engineDir}" --player1 "${options.player1Command}" --player2 "${options.player2Command}"`,
  ];

  if (options.seed !== undefined) {
    args[args.length - 1] += ` --seed ${options.seed}`;
  }

  if (options.port !== undefined) {
    args[args.length - 1] += ` --port ${options.port}`;
  }

  if (options.simulate !== false) {
    args[args.length - 1] += " --simulate";
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
