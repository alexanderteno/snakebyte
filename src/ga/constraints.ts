import type { WeightKey } from "../config.js";
import type { CandidateWeights } from "./types.js";

type ConstraintDirection = "nonnegative" | "nonpositive";

const DIRECTIONAL_CONSTRAINTS: Partial<Record<WeightKey, ConstraintDirection>> = {
  survivalImmediate: "nonnegative",
  survivalAfterFall: "nonnegative",
  applesEaten: "nonnegative",
  adjacentAppleStall: "nonpositive",
  nearestAppleDistance: "nonpositive",
  pathAppleDistance: "nonpositive",
  gravityAppleDistance: "nonpositive",
  appleRaceMargin: "nonnegative",
  appleControl: "nonnegative",
  supportStability: "nonnegative",
  supportDelta: "nonnegative",
  selfCollisionRisk: "nonpositive",
  outOfBoundsRisk: "nonpositive",
  fallDistance: "nonpositive",
  reachableSpace: "nonnegative",
  minReachableSpace: "nonnegative",
  escapePressure: "nonpositive",
  headToHeadPressure: "nonpositive",
  opponentFirstReach: "nonpositive",
  friendlyHeadPressure: "nonpositive",
  bodyCountDelta: "nonnegative",
  headExposure: "nonpositive",
};

export function constrainWeights(weights: CandidateWeights): CandidateWeights {
  const constrained = { ...weights };
  for (const [key, direction] of Object.entries(DIRECTIONAL_CONSTRAINTS) as Array<[WeightKey, ConstraintDirection]>) {
    const value = constrained[key];
    if (direction === "nonnegative" && value < 0) {
      constrained[key] = 0;
    }
    if (direction === "nonpositive" && value > 0) {
      constrained[key] = 0;
    }
  }
  return constrained;
}

export function directionalPenalty(weights: CandidateWeights): number {
  let penalty = 0;
  for (const [key, direction] of Object.entries(DIRECTIONAL_CONSTRAINTS) as Array<[WeightKey, ConstraintDirection]>) {
    const value = weights[key];
    if (direction === "nonnegative" && value < 0) {
      penalty += Math.abs(value);
    }
    if (direction === "nonpositive" && value > 0) {
      penalty += Math.abs(value);
    }
  }
  return penalty;
}
