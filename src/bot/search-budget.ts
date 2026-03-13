import type { ExperimentConfig } from "../config.js";
import type { FrameState } from "./protocol.js";

const DENSE_EARLY_BUDGET = {
  maxCandidateMovesPerSnakebot: 2,
  maxJointActions: 12,
};

const DENSE_BUDGET = {
  maxCandidateMovesPerSnakebot: 2,
  maxJointActions: 16,
};

export function inferTurnIndex(frameState: FrameState): number {
  if (frameState.birds.length === 0) {
    return 0;
  }

  const longestBody = Math.max(...frameState.birds.map((bird) => bird.body.length));
  return Math.max(0, longestBody - 1);
}

export function resolveSearchBudget(
  frameState: FrameState,
  snakebotCount: number,
  baseConfig: Pick<ExperimentConfig, "maxCandidateMovesPerSnakebot" | "maxJointActions">,
): Pick<ExperimentConfig, "maxCandidateMovesPerSnakebot" | "maxJointActions"> {
  const turnIndex = inferTurnIndex(frameState);
  if (snakebotCount >= 4 && turnIndex < 2) {
    return DENSE_EARLY_BUDGET;
  }

  if (snakebotCount >= 4) {
    return DENSE_BUDGET;
  }

  return baseConfig;
}
