import type { Candidate, RouterDecision } from "./types";
export type ConflictSeverity = "none" | "mild" | "moderate" | "severe";
export declare const assessConflictSeverity: (candidate: Candidate) => ConflictSeverity;
export declare const decisionForConflict: (severity: ConflictSeverity, fallback: RouterDecision) => RouterDecision;
