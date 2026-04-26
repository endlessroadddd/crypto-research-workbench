import { average, clamp } from "./utils";
const evidencePriority = (evidence) => {
    const categoryWeight = evidence.category === "confirmation"
        ? 4
        : evidence.category === "discovery"
            ? 3
            : evidence.category === "risk"
                ? 2
                : 5;
    return (categoryWeight * 1000 +
        evidence.freshnessWeight * 100 +
        evidence.strength * 10 +
        evidence.confidence);
};
export const dedupeSameFamily = (evidence) => {
    const groups = new Map();
    for (const item of evidence) {
        const key = `${item.symbol}:${item.sourceFamily}:${item.sameFamilyDedupeKey}`;
        const current = groups.get(key) ?? [];
        current.push(item);
        groups.set(key, current);
    }
    const result = [];
    for (const group of groups.values()) {
        const sorted = [...group].sort((left, right) => evidencePriority(right) - evidencePriority(left));
        sorted.forEach((item, index) => {
            result.push({
                ...item,
                isPrimary: index === 0
            });
        });
    }
    return result;
};
const familyDominantDirection = (evidence, direction) => evidence
    .filter((item) => item.direction === direction && item.category !== "risk")
    .reduce((sum, item) => sum + item.freshnessWeight * item.strength * item.confidence, 0);
export const computeResonance = (evidence, resonanceCap) => {
    const primaries = evidence.filter((item) => item.isPrimary && item.freshnessState !== "stale" && item.category !== "risk");
    const grouped = new Map();
    for (const item of primaries) {
        const current = grouped.get(item.sourceFamily) ?? [];
        current.push(item);
        grouped.set(item.sourceFamily, current);
    }
    const alignedBullishFamilies = [...grouped.values()].filter((items) => familyDominantDirection(items, "bullish") > familyDominantDirection(items, "bearish")).length;
    const alignedBearishFamilies = [...grouped.values()].filter((items) => familyDominantDirection(items, "bearish") > familyDominantDirection(items, "bullish")).length;
    const dominantThemeEntries = primaries
        .filter((item) => item.crossFamilyThemeKey)
        .map((item) => item.crossFamilyThemeKey);
    const dominantThemeKey = dominantThemeEntries.length === 0
        ? undefined
        : dominantThemeEntries
            .sort((left, right) => dominantThemeEntries.filter((item) => item === right).length -
            dominantThemeEntries.filter((item) => item === left).length)[0];
    const dominantFamilies = Math.max(alignedBullishFamilies, alignedBearishFamilies);
    const resonanceScore = clamp((dominantFamilies - 1) * 0.05, 0, resonanceCap);
    return {
        familyCount: grouped.size,
        alignedBullishFamilies,
        alignedBearishFamilies,
        resonanceScore,
        dominantThemeKey
    };
};
export const corroborationBonusForDirection = (evidence, direction, corroborationCap) => {
    const grouped = new Map();
    for (const item of evidence.filter((entry) => entry.freshnessState !== "stale" &&
        entry.direction === direction &&
        entry.category !== "risk" &&
        entry.isPrimary)) {
        const current = grouped.get(item.sourceFamily) ?? [];
        current.push(item.strength * item.confidence * item.freshnessWeight);
        grouped.set(item.sourceFamily, current);
    }
    const corroboratingFamilies = [...grouped.values()].filter((scores) => average(scores) >= 0.4).length;
    return clamp((corroboratingFamilies - 1) * 0.04, 0, corroborationCap);
};
//# sourceMappingURL=fusion.js.map