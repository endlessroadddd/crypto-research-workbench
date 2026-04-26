import type { Evidence, FreshnessState } from "./types";
export interface FreshnessResult {
    freshnessState: FreshnessState;
    freshnessWeight: number;
}
export declare const computeFreshness: (timestamp: string, ttlMs: number, degradingStartRatio: number, now: Date, degradingFloor?: number) => FreshnessResult;
export declare const applyFreshness: (evidence: Evidence[], now: Date, degradingFloor?: number) => Evidence[];
