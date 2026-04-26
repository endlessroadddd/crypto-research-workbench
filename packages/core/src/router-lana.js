import { defaultRouterConfig } from "./config";
export const routeLana = (candidate) => {
    const breakdown = candidate.scoreBreakdown;
    const hasStructureConfirmation = candidate.activeEvidence.some((item) => item.sourceFamily === "market_structure" &&
        item.category === "confirmation" &&
        item.direction === "bullish");
    const hasSocialOnly = candidate.activeEvidence.some((item) => ["social_sentiment", "rank_aggregator"].includes(item.sourceFamily) &&
        item.direction === "bullish") && !hasStructureConfirmation;
    const hasStrongDiscovery = breakdown.discoveryScore >= defaultRouterConfig.thresholds.watchlistScore ||
        candidate.resonance.alignedBullishFamilies >= 2;
    if (candidate.lifecycleStage === "late_speculative" ||
        ["range_distribution", "data_degraded"].includes(candidate.regimeState)) {
        return "observe";
    }
    if (candidate.regimeState === "range_chop") {
        return hasStrongDiscovery ? "watchlist" : "observe";
    }
    if (!hasStructureConfirmation || hasSocialOnly) {
        return hasStrongDiscovery || breakdown.finalScore >= defaultRouterConfig.thresholds.watchlistScore
            ? "watchlist"
            : "observe";
    }
    if (breakdown.finalScore >= defaultRouterConfig.thresholds.candidateScore) {
        return "trend_long_candidate";
    }
    if (breakdown.finalScore >= defaultRouterConfig.thresholds.watchlistScore) {
        return "watchlist";
    }
    return "observe";
};
//# sourceMappingURL=router-lana.js.map