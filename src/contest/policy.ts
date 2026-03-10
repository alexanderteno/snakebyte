import type { CandidateWeights } from "../ga/types.js";
import { buildCandidateJointActions } from "../bot/candidates.js";
import { formatJointAction } from "../bot/actions.js";
import { evaluateJointAction, type EvaluationResult } from "../bot/evaluator.js";
import type { FrameState, GlobalState } from "../bot/protocol.js";
import { createRuntimeState } from "../bot/state.js";

const CONTEST_CONFIG = {
  maxCandidateMovesPerSnakebot: 3,
  maxJointActions: 24,
  lookaheadTopActions: 4,
  lookaheadDiscount: 0.6,
  lookaheadGapThreshold: 0.5,
};

export function chooseContestCommand(
  globalState: GlobalState,
  frameState: FrameState,
  weights: CandidateWeights,
): string {
  const runtimeState = createRuntimeState(globalState, frameState, {
    maxCandidateMovesPerSnakebot: CONTEST_CONFIG.maxCandidateMovesPerSnakebot,
    maxJointActions: CONTEST_CONFIG.maxJointActions,
  });
  const jointActions = buildCandidateJointActions(runtimeState, weights);

  if (jointActions.length === 0) {
    return "WAIT";
  }

  const evaluations = jointActions
    .map((jointAction) => evaluateJointAction(runtimeState, jointAction, weights))
    .sort((left, right) => right.score - left.score);

  const scoredEvaluations = shouldApplyLookahead(evaluations)
    ? applyShortLookahead(runtimeState, weights, evaluations)
    : evaluations;

  const best = scoredEvaluations.reduce(selectBestEvaluation);
  return formatJointAction(best.jointAction);
}

function selectBestEvaluation(currentBest: EvaluationResult, candidate: EvaluationResult): EvaluationResult {
  if (candidate.score > currentBest.score) {
    return candidate;
  }

  return currentBest;
}

function shouldApplyLookahead(evaluations: EvaluationResult[]): boolean {
  if (evaluations.length < 2) {
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
): EvaluationResult[] {
  const topCount = Math.min(CONTEST_CONFIG.lookaheadTopActions, evaluations.length);
  const enhanced = evaluations.slice(0, topCount).map((evaluation) => {
    const nextRuntimeState = {
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
    const continuationEvaluations = buildCandidateJointActions(nextRuntimeState, weights).map((jointAction) =>
      evaluateJointAction(nextRuntimeState, jointAction, weights)
    );
    const continuationBest = continuationEvaluations.sort((left, right) => right.score - left.score)[0];

    if (!continuationBest) {
      return evaluation;
    }

    return {
      ...evaluation,
      score: evaluation.score + (CONTEST_CONFIG.lookaheadDiscount * continuationBest.score),
    };
  });

  return [...enhanced, ...evaluations.slice(topCount)].sort((left, right) => right.score - left.score);
}
