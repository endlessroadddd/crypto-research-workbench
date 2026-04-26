import type { Evidence, LifecycleStage } from "./types";
export declare const classifyLifecycle: (evidence: Evidence[], marketType: "spot" | "perp" | "both") => LifecycleStage;
