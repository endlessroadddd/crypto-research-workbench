import { defaultRouterConfig } from "./config";
export const routeSkanda = (candidate) => {
    const breakdown = candidate.scoreBreakdown;
    const hasStructureConfirmation = candidate.activeEvidence.some((item) => item.sourceFamily === "market_structure" &&
        item.category === "confirmation" &&
        item.direction === "bearish");
    if (candidate.marketType === "spot") {
        return "observe";
    }
    if (candidate.regimeState === "range_distribution") {
        return "range_distribution_watch";
    }
    if (candidate.regimeState !== "blowoff_exhaustion" || !hasStructureConfirmation) {
        return breakdown.finalScore >= defaultRouterConfig.thresholds.watchlistScore
            ? "watchlist"
            : "observe";
    }
    if (breakdown.finalScore >= defaultRouterConfig.thresholds.candidateScore) {
        return "short_candidate";
    }
    return "watchlist";
};
//# sourceMappingURL=router-skanda.js.map