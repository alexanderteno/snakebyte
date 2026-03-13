import { defaultExperimentConfig } from "../config.js";
import type { CandidateWeights } from "../ga/types.js";
import { buildCandidateEvaluations } from "./candidates.js";
import { formatJointAction } from "./actions.js";
import { createTurnDeadline } from "./deadline.js";
import { maybeWriteTurnDiagnostics } from "./diagnostics.js";
import type { EvaluationResult } from "./evaluator.js";
import { beginTurnPerf, endTurnPerf, recordCounter, timeSection } from "./perf.js";
import type { FrameState, GlobalState } from "./protocol.js";
import { applyRepeatPenalty, recordChosenJointAction } from "./repeat-memory.js";
import { inferTurnIndex, resolveSearchBudget } from "./search-budget.js";
import { createRuntimeState } from "./state.js";

const LOOKAHEAD_SAFETY = {
  maxCandidateCount: 4,
  maxSnakebotCount: 2,
  minTurnIndex: 2,
};

export function chooseCommand(
  globalState: GlobalState,
  frameState: FrameState,
  weights: CandidateWeights,
): string {
  beginTurnPerf("bot");
  const deadline = createTurnDeadline();
  const turnIndex = inferTurnIndex(frameState);
  const searchBudget = resolveSearchBudget(frameState, globalState.myBirdIds.length, {
    maxCandidateMovesPerSnakebot: defaultExperimentConfig.maxCandidateMovesPerSnakebot,
    maxJointActions: defaultExperimentConfig.maxJointActions,
  });
  const runtimeState = timeSection("createRuntimeState", () => createRuntimeState(globalState, frameState, searchBudget));
  const rootBatch = buildCandidateEvaluations(runtimeState, weights, deadline);
  const evaluations = applyRepeatPenalty(frameState, rootBatch.evaluations);

  if (evaluations.length === 0) {
    const fallbackCommand = rootBatch.fallbackJointAction ? formatJointAction(rootBatch.fallbackJointAction) : "WAIT";
    endTurnPerf({
      command: fallbackCommand,
      candidateCount: 0,
      lookaheadApplied: false,
      interrupted: rootBatch.interrupted,
      usedCheapFallback: true,
      usedFeatureApproximation: rootBatch.usedFeatureApproximation,
      usedLookaheadFallback: false,
      deadlineTimeRemainingMs: deadline.timeRemainingMs(),
      bestCompletedCandidateRank: rootBatch.bestCompletedCandidateRank,
      maxCandidateMovesPerSnakebot: searchBudget.maxCandidateMovesPerSnakebot,
      maxJointActions: searchBudget.maxJointActions,
    });
    return fallbackCommand;
  }

  const scoredEvaluations = shouldApplyLookahead(evaluations, runtimeState.mySnakebots.length, turnIndex)
    ? applyShortLookahead(runtimeState, weights, evaluations, deadline)
    : evaluations;
  recordCounter("lookahead_applied", scoredEvaluations === evaluations ? 0 : 1);

  const best = scoredEvaluations.reduce(selectBestEvaluation);

  maybeDumpCandidates(scoredEvaluations.slice(0, 5));
  maybeWriteTurnDiagnostics(runtimeState, scoredEvaluations, best);
  const command = formatJointAction(best.jointAction);
  recordChosenJointAction(frameState, best.jointAction);
  endTurnPerf({
    command,
    candidateCount: evaluations.length,
    lookaheadApplied: scoredEvaluations !== evaluations,
    interrupted: rootBatch.interrupted || deadline.shouldStop(),
    usedCheapFallback: false,
    usedFeatureApproximation: rootBatch.usedFeatureApproximation,
    usedLookaheadFallback: scoredEvaluations.length < evaluations.length,
    deadlineTimeRemainingMs: deadline.timeRemainingMs(),
    bestCompletedCandidateRank: rootBatch.bestCompletedCandidateRank,
    maxCandidateMovesPerSnakebot: searchBudget.maxCandidateMovesPerSnakebot,
    maxJointActions: searchBudget.maxJointActions,
  });
  return command;
}

function selectBestEvaluation(currentBest: EvaluationResult, candidate: EvaluationResult): EvaluationResult {
  if (candidate.score > currentBest.score) {
    return candidate;
  }
  return currentBest;
}

function maybeDumpCandidates(results: EvaluationResult[]): void {
  const mode = process.env.SNAKEBYTE_DEBUG_CANDIDATES;
  if (!mode) {
    return;
  }

  for (const result of results) {
    if (mode === "verbose") {
      process.stderr.write(`${JSON.stringify(result.debug)}\n`);
      continue;
    }

    process.stderr.write(`${result.debug.jointAction} score=${result.score.toFixed(2)} features=${JSON.stringify(result.features)}\n`);
  }
}

function shouldApplyLookahead(
  evaluations: EvaluationResult[],
  snakebotCount: number,
  turnIndex: number,
): boolean {
  if (defaultExperimentConfig.lookaheadEnabled) {
    return true;
  }

  if (evaluations.length < 2) {
    return false;
  }
  if (evaluations.length > LOOKAHEAD_SAFETY.maxCandidateCount) {
    return false;
  }
  if (snakebotCount > LOOKAHEAD_SAFETY.maxSnakebotCount) {
    return false;
  }
  if (turnIndex < LOOKAHEAD_SAFETY.minTurnIndex) {
    return false;
  }

  const [best, secondBest] = evaluations;
  if (!best || !secondBest) {
    return false;
  }

  return (best.score - secondBest.score) <= defaultExperimentConfig.lookaheadGapThreshold;
}
function applyShortLookahead(
  runtimeState: ReturnType<typeof createRuntimeState>,
  weights: CandidateWeights,
  evaluations: EvaluationResult[],
  deadline: ReturnType<typeof createTurnDeadline>,
): EvaluationResult[] {
  return timeSection("applyShortLookahead", () => {
    if (deadline.shouldSkipDeepWork()) {
      recordCounter("lookahead_interrupts");
      return evaluations;
    }

    const topCount = Math.min(defaultExperimentConfig.lookaheadTopActions, evaluations.length);
    const enhanced: EvaluationResult[] = [];
    for (const evaluation of evaluations.slice(0, topCount)) {
      if (deadline.shouldStop()) {
        recordCounter("lookahead_interrupts");
        break;
      }
      const nextRuntimeState = cloneRuntimeState(runtimeState, evaluation);
      const continuationBatch = buildCandidateEvaluations(nextRuntimeState, weights, deadline);
      const continuationEvaluations = continuationBatch.evaluations;
      recordCounter("lookahead_root_candidates");
      recordCounter("lookahead_continuations", continuationEvaluations.length);
      const continuationBest = continuationEvaluations[0];
      if (!continuationBest) {
        enhanced.push(evaluation);
        continue;
      }

      const score = evaluation.score + (defaultExperimentConfig.lookaheadDiscount * continuationBest.score);
      enhanced.push({
        ...evaluation,
        score,
        debug: {
          ...evaluation.debug,
          score,
        },
      });
    }

    return [...enhanced, ...evaluations.slice(topCount)].sort((left, right) => right.score - left.score);
  });
}

function cloneRuntimeState(
  runtimeState: ReturnType<typeof createRuntimeState>,
  evaluation: EvaluationResult,
): ReturnType<typeof createRuntimeState> {
  return {
    global: runtimeState.global,
    frame: runtimeState.frame,
    width: evaluation.resolvedTurn.nextState.width,
    height: evaluation.resolvedTurn.nextState.height,
    apples: evaluation.resolvedTurn.nextState.apples,
    mySnakebots: evaluation.resolvedTurn.nextState.mySnakebots.map((snakebot) => ({
      id: snakebot.id,
      body: snakebot.body,
      head: snakebot.head,
      facing: snakebot.facing,
      length: snakebot.body.length,
      owner: snakebot.owner,
    })),
    opponentSnakebots: evaluation.resolvedTurn.nextState.opponentSnakebots.map((snakebot) => ({
      id: snakebot.id,
      body: snakebot.body,
      head: snakebot.head,
      facing: snakebot.facing,
      length: snakebot.body.length,
      owner: snakebot.owner,
    })),
    occupancy: evaluation.resolvedTurn.nextState.occupancy,
    appleSet: new Set(evaluation.resolvedTurn.nextState.apples.map((apple) => `${apple.x},${apple.y}`)),
    config: runtimeState.config,
  };
}
