import type { JointAction, Direction, SnakebotAction } from "./actions.js";
import { DIRECTIONS } from "./actions.js";
import { evaluateJointAction, type EvaluationResult } from "./evaluator.js";
import type { CandidateWeights } from "../ga/types.js";
import type { TurnDeadline } from "./deadline.js";
import type { RuntimeState, Snakebot } from "./state.js";
import { coordKey, moveCoord, nearestAppleDistance, turnIsLegal } from "./state.js";
import { recordCounter, timeSection } from "./perf.js";

export interface CandidateEvaluationBatch {
  evaluations: EvaluationResult[];
  bestCompleted: EvaluationResult | null;
  fallbackJointAction: JointAction | null;
  interrupted: boolean;
  usedFeatureApproximation: boolean;
  bestCompletedCandidateRank: number;
}

export function buildCandidateJointActions(
  state: RuntimeState,
  weights: CandidateWeights,
): JointAction[] {
  return buildCandidateEvaluations(state, weights).evaluations.map((result) => result.jointAction);
}

export function buildCandidateEvaluations(
  state: RuntimeState,
  weights: CandidateWeights,
  deadline?: TurnDeadline,
): CandidateEvaluationBatch {
  return timeSection("buildCandidateEvaluations", () => {
    const perSnakeCandidates = state.mySnakebots.map((snakebot) =>
      rankSnakebotDirections(state, snakebot).slice(0, state.config.maxCandidateMovesPerSnakebot),
    );

    const jointActions = combineJointActions(state.mySnakebots, perSnakeCandidates, state.config.maxJointActions);
    recordCounter("candidate_joint_actions", jointActions.length);
    const results: EvaluationResult[] = [];
    let bestCompleted: EvaluationResult | null = null;
    let usedFeatureApproximation = false;
    let interrupted = false;

    for (const jointAction of jointActions) {
      if (deadline?.shouldStop()) {
        interrupted = true;
        recordCounter("candidate_eval_interrupts");
        break;
      }

      const result = evaluateJointAction(state, jointAction, weights, deadline);
      if (!result) {
        interrupted = true;
        recordCounter("candidate_eval_interrupts");
        break;
      }

      results.push(result);
      usedFeatureApproximation = usedFeatureApproximation || result.usedFeatureApproximation;
      if (!bestCompleted || result.score > bestCompleted.score) {
        bestCompleted = result;
      }
    }

    const evaluations = results.sort((left, right) => right.score - left.score);
    const bestCompletedCandidateRank = bestCompleted
      ? Math.max(0, evaluations.findIndex((evaluation) => evaluation === bestCompleted))
      : -1;

    return {
      evaluations,
      bestCompleted,
      fallbackJointAction: jointActions[0] ?? null,
      interrupted,
      usedFeatureApproximation,
      bestCompletedCandidateRank,
    };
  });
}

function rankSnakebotDirections(state: RuntimeState, snakebot: Snakebot): Direction[] {
  return [...DIRECTIONS]
    .filter((direction) => turnIsLegal(snakebot, direction))
    .filter((direction) => {
      const target = moveCoord(snakebot.head, direction);
      if (target.x < 0 || target.x >= state.width || target.y < 0 || target.y >= state.height) {
        return false;
      }
      return state.global.rows[target.y]?.[target.x] !== "#";
    })
    .sort((left, right) => scoreDirection(state, snakebot, right) - scoreDirection(state, snakebot, left));
}

function combineJointActions(
  snakebots: Snakebot[],
  perSnakeDirections: Direction[][],
  maxJointActions: number,
): JointAction[] {
  const results: JointAction[] = [];

  function recurse(index: number, partial: SnakebotAction[]): void {
    if (results.length >= maxJointActions) {
      return;
    }

    if (index >= snakebots.length) {
      results.push({ actions: [...partial] });
      return;
    }

    const snakebot = snakebots[index];
    if (!snakebot) {
      return;
    }
    const directions = perSnakeDirections[index] ?? [snakebot.facing];

    for (const direction of directions) {
      partial.push({ snakebotId: snakebot.id, direction });
      recurse(index + 1, partial);
      partial.pop();
      if (results.length >= maxJointActions) {
        break;
      }
    }
  }

  recurse(0, []);

  return results;
}

function scoreDirection(state: RuntimeState, snakebot: Snakebot, direction: Direction): number {
  const target = moveCoord(snakebot.head, direction);
  let score = 0;

  if (state.appleSet.has(coordKey(target))) {
    score += 100;
  }

  score -= nearestAppleDistance(target, state.apples);

  const below = { x: target.x, y: target.y + 1 };
  if (below.y >= state.height || state.global.rows[below.y]?.[below.x] === "#" || state.appleSet.has(coordKey(below)) || state.occupancy.has(coordKey(below))) {
    score += 3;
  }

  return score;
}
