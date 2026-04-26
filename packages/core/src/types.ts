export type InstallProfile = "active-only" | "full-profile" | "debug-profile";

export type InstallState =
  | "installed_active"
  | "installed_dormant"
  | "not_installed"
  | "forbidden_for_scoring";

export type SourceFamily =
  | "market_structure"
  | "onchain_flow"
  | "rank_aggregator"
  | "social_sentiment"
  | "risk_annotation";

export type EvidenceCategory =
  | "discovery"
  | "confirmation"
  | "risk"
  | "veto";

export type EvidenceDirection =
  | "bullish"
  | "bearish"
  | "neutral"
  | "risk";

export type FreshnessState = "fresh" | "degrading" | "stale";

export type SourceStatus = "healthy" | "degraded" | "stale" | "unavailable";
export type SourceRuntimeMode = "live" | "fixture" | "unavailable";

export type LifecycleStage =
  | "onchain_early"
  | "cex_transition"
  | "cex_liquid"
  | "late_speculative";

export type RegimeState =
  | "trend_expansion"
  | "trend_mature"
  | "range_chop"
  | "blowoff_exhaustion"
  | "range_distribution"
  | "data_degraded";

export type RouterMode = "trend_long" | "exhaustion_short";

export type RouterDecision =
  | "observe"
  | "observe_soft"
  | "observe_cooloff_15m"
  | "watchlist"
  | "range_distribution_watch"
  | "trend_long_candidate"
  | "short_candidate"
  | "veto";

export type ConfidenceBand = "low" | "medium" | "high";

export interface Evidence {
  id: string;
  symbol: string;
  source: string;
  subsource: string;
  sourceFamily: SourceFamily;
  category: EvidenceCategory;
  direction: EvidenceDirection;
  timestamp: string;
  ttlMs: number;
  degradingStartRatio: number;
  freshnessState: FreshnessState;
  freshnessWeight: number;
  strength: number;
  confidence: number;
  sameFamilyDedupeKey: string;
  crossFamilyThemeKey?: string;
  isPrimary: boolean;
  rawRef?: string;
  details?: Record<string, unknown>;
}

export interface ResonanceBreakdown {
  familyCount: number;
  alignedBullishFamilies: number;
  alignedBearishFamilies: number;
  resonanceScore: number;
  dominantThemeKey?: string;
}

export interface ScoreBreakdown {
  discoveryScore: number;
  confirmationScore: number;
  riskPenalty: number;
  corroborationBonus: number;
  resonanceBonus: number;
  regimeMultiplier: number;
  lifecycleMultiplier: number;
  vetoState: "none" | "soft" | "hard";
  finalScore: number;
}

export interface Candidate {
  symbol: string;
  baseAsset?: string;
  quoteAsset?: string;
  chain?: string | null;
  contractAddresses?: string[];
  marketType: "spot" | "perp" | "both";
  lifecycleStage: LifecycleStage;
  regimeState: RegimeState;
  evidence: Evidence[];
  activeEvidence: Evidence[];
  historicalEvidence: Evidence[];
  sourceFamiliesSeen: SourceFamily[];
  resonance: ResonanceBreakdown;
  scoreBreakdown: ScoreBreakdown;
  riskFlags: string[];
  degradedFlags: string[];
  invalidators: string[];
  routerEligibleModes: RouterMode[];
  routerDecision: RouterDecision;
  confidenceBand: ConfidenceBand;
  manualReviewRequired: boolean;
  decisionReason: string[];
}

export interface SourceCoverageItem {
  name: string;
  family: SourceFamily;
  installProfile: InstallProfile;
  installState: InstallState;
  runtimeMode: SourceRuntimeMode;
  readiness: boolean;
  pinnedVersion: string;
  pinnedSha: string;
  lastUpdated?: string;
  status: SourceStatus;
  rateLimited: boolean;
  retrying: boolean;
  backoffLevel: number;
  retryAt?: string;
  samplePayloadAvailable: boolean;
  errors: string[];
}

export interface ManualReviewChecklist {
  whyInPool: string[];
  bullishFactors: string[];
  bearishFactors: string[];
  riskFactors: string[];
  dataGaps: string[];
  staleSources: string[];
  unresolvedConflicts: string[];
  recommendedAction: "observe" | "watch-closely" | "possible-long" | "possible-short";
}

export interface ManualReviewFeedback {
  candidateId: string;
  reviewedAt: string;
  reviewerAction: "dismiss" | "watch" | "long-bias" | "short-bias";
  reviewerNotes?: string;
  thesisAccepted: boolean;
  timingAccepted: boolean;
}

export interface CandidateInput {
  symbol: string;
  baseAsset?: string;
  quoteAsset?: string;
  chain?: string | null;
  contractAddresses?: string[];
  marketType: "spot" | "perp" | "both";
  evidence: Evidence[];
}

export interface EvaluationContext {
  now: Date;
  sourceCoverage: SourceCoverageItem[];
}
