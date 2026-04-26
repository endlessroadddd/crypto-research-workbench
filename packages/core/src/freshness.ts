import { clamp } from "./utils";
import type { Evidence, FreshnessState } from "./types";

export interface FreshnessResult {
  freshnessState: FreshnessState;
  freshnessWeight: number;
}

export const computeFreshness = (
  timestamp: string,
  ttlMs: number,
  degradingStartRatio: number,
  now: Date,
  degradingFloor = 0.2
): FreshnessResult => {
  const age = Math.max(0, now.getTime() - new Date(timestamp).getTime());
  const degradingStart = ttlMs * degradingStartRatio;

  if (age <= degradingStart) {
    return { freshnessState: "fresh", freshnessWeight: 1 };
  }

  if (age <= ttlMs) {
    const progress = (age - degradingStart) / Math.max(1, ttlMs - degradingStart);
    return {
      freshnessState: "degrading",
      freshnessWeight: clamp(1 - progress * (1 - degradingFloor), degradingFloor, 1)
    };
  }

  return { freshnessState: "stale", freshnessWeight: 0 };
};

export const applyFreshness = (
  evidence: Evidence[],
  now: Date,
  degradingFloor = 0.2
): Evidence[] =>
  evidence.map((item) => {
    const freshness = computeFreshness(
      item.timestamp,
      item.ttlMs,
      item.degradingStartRatio,
      now,
      degradingFloor
    );

    return {
      ...item,
      ...freshness
    };
  });

