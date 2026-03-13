import type { CandidateWeights } from "../ga/types.js";
import { buildCandidateEvaluations } from "../bot/candidates.js";
import { formatJointAction } from "../bot/actions.js";
import { createTurnDeadline } from "../bot/deadline.js";
import type { EvaluationResult } from "../bot/evaluator.js";
import type { FrameState, GlobalState } from "../bot/protocol.js";
import { applyRepeatPenalty, recordChosenJointAction } from "../bot/repeat-memory.js";
import { inferTurnIndex, resolveSearchBudget } from "../bot/search-budget.js";
import { createRuntimeState } from "../bot/state.js";

const CONTEST_CONFIG = {
  maxCandidateMovesPerSnakebot: 3,
  maxJointActions: 24,
  lookaheadTopActions: 4,
  lookaheadDiscount: 0.6,
  lookaheadGapThreshold: 0.5,
  lookaheadMaxCandidateCount: 4,
  lookaheadMaxSnakebotCount: 2,
  lookaheadMinTurnIndex: 2,
};

export function chooseContestCommand(
  globalState: GlobalState,
  frameState: FrameState,
  weights: CandidateWeights,
): string {
  const deadline = createTurnDeadline();
  const searchBudget = resolveSearchBudget(frameState, globalState.myBirdIds.length, {
    maxCandidateMovesPerSnakebot: CONTEST_CONFIG.maxCandidateMovesPerSnakebot,
    maxJointActions: CONTEST_CONFIG.maxJointActions,
  });
  const runtimeState = createRuntimeState(globalState, frameState, searchBudget);
  const rootBatch = buildCandidateEvaluations(runtimeState, weights, deadline);
  const evaluations = applyRepeatPenalty(frameState, rootBatch.evaluations);
  const turnIndex = inferTurnIndex(frameState);

  if (evaluations.length === 0) {
    return rootBatch.fallbackJointAction ? formatJointAction(rootBatch.fallbackJointAction) : "WAIT";
  }

  const scoredEvaluations = shouldApplyLookahead(evaluations, runtimeState.mySnakebots.length, turnIndex)
    ? applyShortLookahead(runtimeState, weights, evaluations, deadline)
    : evaluations;

  const best = scoredEvaluations.reduce(selectBestEvaluation);
  recordChosenJointAction(frameState, best.jointAction);
  return formatJointAction(best.jointAction);
}

function selectBestEvaluation(currentBest: EvaluationResult, candidate: EvaluationResult): EvaluationResult {
  if (candidate.score > currentBest.score) {
    return candidate;
  }

  return currentBest;
}

function shouldApplyLookahead(
  evaluations: EvaluationResult[],
  snakebotCount: number,
  turnIndex: number,
): boolean {
  if (evaluations.length < 2) {
    return false;
  }
  if (evaluations.length > CONTEST_CONFIG.lookaheadMaxCandidateCount) {
    return false;
  }
  if (snakebotCount > CONTEST_CONFIG.lookaheadMaxSnakebotCount) {
    return false;
  }
  if (turnIndex < CONTEST_CONFIG.lookaheadMinTurnIndex) {
    return false;
  }

  const [best, secondBest] = evaluations;
  if (!best || !secondBest) {
    return false;
  }

  return (best.score - secondBest.score) <= CONTEST_CONFIG.lookaheadGapThreshold;
}
function applyShortLookahead(
  runtimeState: ReturnType<typeof createRuntimeState>,
  weights: CandidateWeights,
  evaluations: EvaluationResult[],
  deadline: ReturnType<typeof createTurnDeadline>,
): EvaluationResult[] {
  if (deadline.shouldSkipDeepWork()) {
    return evaluations;
  }
  const topCount = Math.min(CONTEST_CONFIG.lookaheadTopActions, evaluations.length);
  const enhanced: EvaluationResult[] = [];
  for (const evaluation of evaluations.slice(0, topCount)) {
    if (deadline.shouldStop()) {
      break;
    }
    const nextRuntimeState = cloneRuntimeState(runtimeState, evaluation);
    const continuationBest = buildCandidateEvaluations(nextRuntimeState, weights, deadline).evaluations[0];

    if (!continuationBest) {
      enhanced.push(evaluation);
      continue;
    }

    enhanced.push({
      ...evaluation,
      score: evaluation.score + (CONTEST_CONFIG.lookaheadDiscount * continuationBest.score),
    });
  }

  return [...enhanced, ...evaluations.slice(topCount)].sort((left, right) => right.score - left.score);
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
