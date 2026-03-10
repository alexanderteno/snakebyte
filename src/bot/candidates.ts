import type { JointAction, Direction, SnakebotAction } from "./actions.js";
import { DIRECTIONS } from "./actions.js";
import { evaluateJointAction } from "./evaluator.js";
import type { CandidateWeights } from "../ga/types.js";
import type { RuntimeState, Snakebot } from "./state.js";
import { moveCoord, turnIsLegal } from "./state.js";

export function buildCandidateJointActions(
  state: RuntimeState,
  weights: CandidateWeights,
): JointAction[] {
  const perSnakeCandidates = state.mySnakebots.map((snakebot) =>
    rankSnakebotDirections(state, snakebot).slice(0, state.config.maxCandidateMovesPerSnakebot),
  );

  const jointActions = combineJointActions(state.mySnakebots, perSnakeCandidates, state.config.maxJointActions);

  return jointActions
    .map((jointAction) => evaluateJointAction(state, jointAction, weights))
    .sort((left, right) => right.score - left.score)
    .map((result) => result.jointAction);
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
    });
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
