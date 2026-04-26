import type { Candidate, ManualReviewChecklist } from "@research/core";

export const buildManualReviewChecklist = (
  candidate: Candidate
): ManualReviewChecklist => ({
  whyInPool: candidate.decisionReason,
  bullishFactors: candidate.activeEvidence
    .filter((item) => item.direction === "bullish" && item.category !== "risk")
    .map((item) => `${item.sourceFamily}:${item.subsource}`),
  bearishFactors: candidate.activeEvidence
    .filter((item) => item.direction === "bearish" && item.category !== "risk")
    .map((item) => `${item.sourceFamily}:${item.subsource}`),
  riskFactors: candidate.riskFlags,
  dataGaps: candidate.degradedFlags,
  staleSources: candidate.historicalEvidence.map((item) => item.source),
  unresolvedConflicts: candidate.decisionReason.filter((item) => item.startsWith("conflict:")),
  recommendedAction:
    candidate.routerDecision === "trend_long_candidate"
      ? "possible-long"
      : candidate.routerDecision === "short_candidate"
        ? "possible-short"
        : candidate.routerDecision === "watchlist" || candidate.routerDecision === "range_distribution_watch"
          ? "watch-closely"
          : "observe"
});

