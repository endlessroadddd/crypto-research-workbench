import type { Candidate, LifecycleStage, RegimeState, ResonanceBreakdown, ScoreBreakdown } from "./types";
export declare const calculateScoreBreakdown: (candidate: Candidate, direction: "bullish" | "bearish", resonance: ResonanceBreakdown, lifecycleStage: LifecycleStage, regimeState: RegimeState) => ScoreBreakdown;
