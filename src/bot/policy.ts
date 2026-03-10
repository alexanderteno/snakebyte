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

  const evaluations = jointActions
    .map((jointAction) => evaluateJointAction(runtimeState, jointAction, weights))
    .sort((left, right) => right.score - left.score);

  const scoredEvaluations = defaultExperimentConfig.lookaheadEnabled
    ? applyShortLookahead(runtimeState, weights, evaluations)
    : evaluations;

  const best = scoredEvaluations.reduce(selectBestEvaluation);

  maybeDumpCandidates(scoredEvaluations.slice(0, 5));

  return formatJointAction(best.jointAction);
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

function applyShortLookahead(
  runtimeState: ReturnType<typeof createRuntimeState>,
  weights: CandidateWeights,
  evaluations: EvaluationResult[],
): EvaluationResult[] {
  const topCount = Math.min(defaultExperimentConfig.lookaheadTopActions, evaluations.length);
  const enhanced = evaluations.slice(0, topCount).map((evaluation) => {
    const continuationEvaluations = buildCandidateJointActions(
      {
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
      },
      weights,
    ).map((jointAction) =>
      evaluateJointAction(
        {
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
        },
        jointAction,
        weights,
      ),
    );

    const continuationBest = continuationEvaluations.sort((left, right) => right.score - left.score)[0];
    if (!continuationBest) {
      return evaluation;
    }

    const score = evaluation.score + (defaultExperimentConfig.lookaheadDiscount * continuationBest.score);
    return {
      ...evaluation,
      score,
      debug: {
        ...evaluation.debug,
        score,
      },
    };
  });

  return [...enhanced, ...evaluations.slice(topCount)].sort((left, right) => right.score - left.score);
}
