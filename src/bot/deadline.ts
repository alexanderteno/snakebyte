interface TurnDeadlineOptions {
  hardBudgetMs: number;
  softReserveMs: number;
}

export interface TurnDeadline {
  startedAt: number;
  deadlineAt: number;
  softStopAt: number;
  timeRemainingMs(): number;
  shouldStop(): boolean;
  shouldSkipDeepWork(): boolean;
}

const DEFAULT_HARD_BUDGET_MS = 38;
const DEFAULT_SOFT_RESERVE_MS = 10;

export function createTurnDeadline(options: Partial<TurnDeadlineOptions> = {}): TurnDeadline {
  const hardBudgetMs = options.hardBudgetMs ?? readNumberEnv("SNAKEBYTE_TURN_BUDGET_MS", DEFAULT_HARD_BUDGET_MS);
  const softReserveMs = options.softReserveMs ?? readNumberEnv("SNAKEBYTE_TURN_SOFT_RESERVE_MS", DEFAULT_SOFT_RESERVE_MS);
  const startedAt = nowMs();
  const deadlineAt = startedAt + hardBudgetMs;
  const softStopAt = deadlineAt - softReserveMs;

  return {
    startedAt,
    deadlineAt,
    softStopAt,
    timeRemainingMs() {
      return deadlineAt - nowMs();
    },
    shouldStop() {
      return nowMs() >= deadlineAt;
    },
    shouldSkipDeepWork() {
      return nowMs() >= softStopAt;
    },
  };
}

function readNumberEnv(name: string, fallback: number): number {
  if (typeof process === "undefined" || !process?.env) {
    return fallback;
  }

  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}
