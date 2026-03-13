import type { JointAction } from "./actions.js";
import type { FrameState } from "./protocol.js";
import type { EvaluationResult } from "./evaluator.js";

interface RepeatEntry {
  signature: string;
  streak: number;
}

const repeatMemory = new Map<number, RepeatEntry>();

const REPEAT_PENALTY_PER_STEP = 4;
const REPEAT_PENALTY_CAP = 16;

export function applyRepeatPenalty(
  frameState: FrameState,
  evaluations: EvaluationResult[],
): EvaluationResult[] {
  const headById = new Map(frameState.birds.map((bird) => [bird.id, bird.body[0] ?? { x: 0, y: 0 }]));

  return evaluations.map((evaluation) => {
    const penalty = predictedRepeatPenalty(headById, evaluation.jointAction);
    if (penalty <= 0) {
      return evaluation;
    }

    return {
      ...evaluation,
      score: evaluation.score - penalty,
      debug: {
        ...evaluation.debug,
        score: evaluation.score - penalty,
      },
    };
  }).sort((left, right) => right.score - left.score);
}

export function recordChosenJointAction(frameState: FrameState, jointAction: JointAction): void {
  const headById = new Map(frameState.birds.map((bird) => [bird.id, bird.body[0] ?? { x: 0, y: 0 }]));

  for (const action of jointAction.actions) {
    const head = headById.get(action.snakebotId);
    if (!head) {
      continue;
    }

    const signature = `${head.x},${head.y}:${action.direction}`;
    const previous = repeatMemory.get(action.snakebotId);
    if (previous?.signature === signature) {
      repeatMemory.set(action.snakebotId, {
        signature,
        streak: previous.streak + 1,
      });
      continue;
    }

    repeatMemory.set(action.snakebotId, {
      signature,
      streak: 1,
    });
  }
}

function predictedRepeatPenalty(
  headById: Map<number, { x: number; y: number }>,
  jointAction: JointAction,
): number {
  let penalty = 0;

  for (const action of jointAction.actions) {
    const head = headById.get(action.snakebotId);
    if (!head) {
      continue;
    }

    const signature = `${head.x},${head.y}:${action.direction}`;
    const previous = repeatMemory.get(action.snakebotId);
    if (previous?.signature !== signature) {
      continue;
    }

    const predictedStreak = previous.streak + 1;
    penalty += Math.min(REPEAT_PENALTY_CAP, Math.max(0, predictedStreak - 1) * REPEAT_PENALTY_PER_STEP);
  }

  return penalty;
}
