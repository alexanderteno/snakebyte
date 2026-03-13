import type { TurnDeadline } from "./deadline.js";

export interface GravitySearchCandidate {
  nearestAppleDistance: number;
  pathAppleDistance: number;
  supported: boolean;
}

export interface GravitySearchPlanEntry {
  shouldSearch: boolean;
  depth: number;
  approximateDistance: number;
}

export function resolveGravitySearchPlan(
  candidates: GravitySearchCandidate[],
  deadline?: TurnDeadline,
): GravitySearchPlanEntry[] {
  const candidateCount = candidates.length;
  if (candidateCount === 0) {
    return [];
  }

  const baseDepth = candidateCount >= 4 ? 3 : candidateCount === 3 ? 4 : 6;
  let maxSearchHeads = candidateCount >= 3 ? 2 : candidateCount;
  let depthCap = baseDepth;
  const timeRemainingMs = deadline?.timeRemainingMs() ?? Number.POSITIVE_INFINITY;

  if (timeRemainingMs <= 8) {
    maxSearchHeads = Math.min(maxSearchHeads, 1);
    depthCap = Math.min(depthCap, 2);
  } else if (timeRemainingMs <= 14) {
    maxSearchHeads = Math.min(maxSearchHeads, 1);
    depthCap = Math.min(depthCap, 3);
  } else if (timeRemainingMs <= 20) {
    depthCap = Math.min(depthCap, 4);
  }

  const ranked = candidates
    .map((candidate, index) => ({
      index,
      candidate,
      priority: computeGravityPriority(candidate),
      depth: resolveDepth(candidate, depthCap),
    }))
    .sort((left, right) => right.priority - left.priority);

  const selected = new Set(
    ranked
      .filter((entry) => entry.depth > 0)
      .slice(0, maxSearchHeads)
      .map((entry) => entry.index),
  );

  return candidates.map((candidate, index) => {
    const rankedEntry = ranked.find((entry) => entry.index === index);
    const depth = rankedEntry?.depth ?? 0;
    return {
      shouldSearch: selected.has(index) && depth > 0,
      depth,
      approximateDistance: candidate.pathAppleDistance,
    };
  });
}

function computeGravityPriority(candidate: GravitySearchCandidate): number {
  let priority = 0;
  priority -= candidate.pathAppleDistance;
  priority -= candidate.nearestAppleDistance * 0.5;
  if (!candidate.supported) {
    priority += 1.5;
  }
  return priority;
}

function resolveDepth(candidate: GravitySearchCandidate, depthCap: number): number {
  let depth = depthCap;
  if (candidate.pathAppleDistance >= 8 && candidate.supported) {
    depth = Math.min(depth, 2);
  }
  if (candidate.nearestAppleDistance <= 2 || candidate.pathAppleDistance <= 3) {
    depth = Math.min(6, depth + 1);
  }
  return Math.max(0, depth);
}
