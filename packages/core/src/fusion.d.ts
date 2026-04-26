import type { Evidence, EvidenceDirection, ResonanceBreakdown } from "./types";
export declare const dedupeSameFamily: (evidence: Evidence[]) => Evidence[];
export declare const computeResonance: (evidence: Evidence[], resonanceCap: number) => ResonanceBreakdown;
export declare const corroborationBonusForDirection: (evidence: Evidence[], direction: Exclude<EvidenceDirection, "neutral" | "risk">, corroborationCap: number) => number;
