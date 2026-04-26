import { coreStructureSources } from "./config";
const hasCoreStructureDegradation = (sourceCoverage) => sourceCoverage.some((item) => coreStructureSources.includes(item.name) &&
    (item.status === "stale" ||
        item.status === "unavailable" ||
        (item.rateLimited && item.backoffLevel >= 2)));
const score = (evidence, predicate) => evidence
    .filter((item) => item.freshnessState !== "stale" && predicate(item))
    .reduce((sum, item) => sum + item.freshnessWeight * item.strength * item.confidence, 0);
export const classifyRegime = (evidence, sourceCoverage) => {
    if (hasCoreStructureDegradation(sourceCoverage)) {
        return "data_degraded";
    }
    const bullishStructure = score(evidence, (item) => item.sourceFamily === "market_structure" &&
        item.category === "confirmation" &&
        item.direction === "bullish");
    const bearishStructure = score(evidence, (item) => item.sourceFamily === "market_structure" &&
        item.category === "confirmation" &&
        item.direction === "bearish");
    const bullishCrowding = score(evidence, (item) => ["social_sentiment", "rank_aggregator"].includes(item.sourceFamily) &&
        item.direction === "bullish");
    const bearishCrowding = score(evidence, (item) => ["social_sentiment", "rank_aggregator"].includes(item.sourceFamily) &&
        item.direction === "bearish");
    const crowding = Math.max(bullishCrowding, bearishCrowding);
    if (bearishStructure >= 0.7 && crowding >= 0.7) {
        return "blowoff_exhaustion";
    }
    if (bearishStructure >= 0.55) {
        return "range_distribution";
    }
    if (bullishStructure >= 0.55) {
        return crowding >= 0.85 ? "trend_mature" : "trend_expansion";
    }
    return "range_chop";
};
//# sourceMappingURL=regime.js.map