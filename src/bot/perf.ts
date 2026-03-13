interface TurnPerfState {
  turn: number;
  label: string;
  startedAt: number;
  timings: Map<string, number>;
  counters: Map<string, number>;
}

let currentTurnPerf: TurnPerfState | null = null;
let turnCounter = 0;

export function beginTurnPerf(label: string): void {
  if (!isPerfEnabled()) {
    return;
  }

  currentTurnPerf = {
    turn: turnCounter,
    label,
    startedAt: nowMs(),
    timings: new Map<string, number>(),
    counters: new Map<string, number>(),
  };
  turnCounter += 1;
}

export function endTurnPerf(extra: Record<string, number | string | boolean> = {}): void {
  if (!currentTurnPerf || !isPerfEnabled()) {
    return;
  }

  const totalMs = nowMs() - currentTurnPerf.startedAt;
  const payload = {
    type: "perf",
    turn: currentTurnPerf.turn,
    label: currentTurnPerf.label,
    totalMs: roundMetric(totalMs),
    timings: Object.fromEntries(
      [...currentTurnPerf.timings.entries()].map(([key, value]) => [key, roundMetric(value)]),
    ),
    counters: Object.fromEntries(currentTurnPerf.counters.entries()),
    ...extra,
  };

  writePerfLine(JSON.stringify(payload));
  currentTurnPerf = null;
}

export function recordTiming(name: string, durationMs: number): void {
  if (!currentTurnPerf || !isPerfEnabled()) {
    return;
  }

  currentTurnPerf.timings.set(name, (currentTurnPerf.timings.get(name) ?? 0) + durationMs);
}

export function recordCounter(name: string, amount = 1): void {
  if (!currentTurnPerf || !isPerfEnabled()) {
    return;
  }

  currentTurnPerf.counters.set(name, (currentTurnPerf.counters.get(name) ?? 0) + amount);
}

export function timeSection<T>(name: string, action: () => T): T {
  if (!isPerfEnabled()) {
    return action();
  }

  const startedAt = nowMs();
  try {
    return action();
  } finally {
    recordTiming(name, nowMs() - startedAt);
  }
}

function isPerfEnabled(): boolean {
  return readProcessEnv("SNAKEBYTE_PERF") !== undefined;
}

function readProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process?.env) {
    return undefined;
  }

  return process.env[name];
}

function writePerfLine(line: string): void {
  if (typeof process !== "undefined" && process?.stderr?.write) {
    process.stderr.write(`${line}\n`);
  }
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}
