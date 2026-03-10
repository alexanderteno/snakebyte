import { defaultExperimentConfig } from "../config.js";
import type { CandidateWeights } from "../ga/types.js";
import { buildCandidateJointActions } from "./candidates.js";
import { formatJointAction } from "./actions.js";
import { evaluateJointAction, type EvaluationResult } from "./evaluator.js";
import type { FrameState, GlobalState } from "./protocol.js";
import { createRuntimeState } from "./state.js";

export function chooseCommand(
  globalState: GlobalState,
  frameState: FrameState,
  weights: CandidateWeights,
): string {
  const runtimeState = createRuntimeState(globalState, frameState, {
    maxCandidateMovesPerSnakebot: defaultExperimentConfig.maxCandidateMovesPerSnakebot,
    maxJointActions: defaultExperimentConfig.maxJointActions,
  });
  const jointActions = buildCandidateJointActions(runtimeState, weights);

  if (jointActions.length === 0) {
    return "WAIT";
  }

  const best = jointActions
    .map((jointAction) => evaluateJointAction(runtimeState, jointAction, weights))
    .reduce(selectBestEvaluation);

  return formatJointAction(best.jointAction);
}

function selectBestEvaluation(currentBest: EvaluationResult, candidate: EvaluationResult): EvaluationResult {
  if (candidate.score > currentBest.score) {
    return candidate;
  }
  return currentBest;
}
