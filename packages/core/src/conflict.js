export const assessConflictSeverity = (candidate) => {
    const hasStaleStructure = candidate.degradedFlags.some((flag) => flag.includes("core_structure:stale") ||
        flag.includes("core_structure:unavailable") ||
        flag.includes("market-structure-feed:stale") ||
        flag.includes("market-structure-feed:unavailable") ||
        flag.includes("market-structure-feed:rate_limited"));
    const socialBullish = candidate.activeEvidence.some((item) => item.sourceFamily === "social_sentiment" &&
        item.direction === "bullish" &&
        item.category !== "risk");
    const structureBearish = candidate.activeEvidence.some((item) => item.sourceFamily === "market_structure" &&
        item.direction === "bearish" &&
        item.category === "confirmation");
    const structureBullish = candidate.activeEvidence.some((item) => item.sourceFamily === "market_structure" &&
        item.direction === "bullish" &&
        item.category === "confirmation");
    const socialBearish = candidate.activeEvidence.some((item) => item.sourceFamily === "social_sentiment" &&
        item.direction === "bearish" &&
        item.category !== "risk");
    if (hasStaleStructure) {
        return "severe";
    }
    if ((socialBullish && structureBearish) || (socialBearish && structureBullish)) {
        return "moderate";
    }
    if ((socialBullish && socialBearish) || (structureBullish && structureBearish)) {
        return "mild";
    }
    return "none";
};
export const decisionForConflict = (severity, fallback) => {
    if (severity === "severe") {
        return "veto";
    }
    if (severity === "moderate") {
        return "observe_cooloff_15m";
    }
    if (severity === "mild" && fallback !== "veto") {
        return fallback === "watchlist" ? "observe_soft" : fallback;
    }
    return fallback;
};
//# sourceMappingURL=conflict.js.map