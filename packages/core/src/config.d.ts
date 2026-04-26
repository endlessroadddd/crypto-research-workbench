import type { InstallProfile, LifecycleStage, RegimeState } from "./types";
export interface RuntimeThresholds {
    watchlistScore: number;
    candidateScore: number;
    highConfidenceScore: number;
    corroborationCap: number;
    resonanceCap: number;
}
export interface RouterConfig {
    thresholds: RuntimeThresholds;
    lifecycleMultipliers: Record<LifecycleStage, number>;
    regimeMultipliers: Record<RegimeState, number>;
    freshnessDegradingFloor: number;
}
export interface SourcePin {
    pinnedVersion: string;
    pinnedSha: string;
    installProfile: InstallProfile;
}
export declare const defaultRouterConfig: RouterConfig;
export declare const sourcePins: Record<string, SourcePin>;
export declare const coreStructureSources: string[];
