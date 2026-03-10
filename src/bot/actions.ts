export const DIRECTIONS = ["UP", "DOWN", "LEFT", "RIGHT"] as const;

export type Direction = (typeof DIRECTIONS)[number];

export interface SnakebotAction {
  snakebotId: number;
  direction: Direction;
}

export interface JointAction {
  actions: SnakebotAction[];
}

export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

export function formatJointAction(jointAction: JointAction): string {
  if (jointAction.actions.length === 0) {
    return "WAIT";
  }

  return jointAction.actions
    .map((action) => `${action.snakebotId} ${action.direction}`)
    .join(";");
}
