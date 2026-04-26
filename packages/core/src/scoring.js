import { defaultRouterConfig } from "./config";
import { clamp } from "./utils";
import { corroborationBonusForDirection } from "./fusion";
const scoreEvidence = (evidence, category, direction) => evidence
    .filter((item) => item.category === category &&
    item.freshnessState !== "stale" &&
    (direction ? item.direction === direction : true))
    .reduce((sum, item) => sum + item.freshnessWeight * item.strength * item.confidence, 0);
const hasFamilyConfirmation = (evidence, family, direction) => evidence.some((item) => item.freshnessState !== "stale" &&
    item.sourceFamily === family &&
    item.category === "confirmation" &&
    item.direction === direction);
const determineVetoState = (candidate, direction) => {
    const vetoForDirection = candidate.activeEvidence.some((item) => item.category === "veto" &&
        (item.direction === direction || item.direction === "neutral" || item.direction === "risk"));
    if (vetoForDirection) {
        return "hard";
    }
    if (direction === "bullish" && !hasFamilyConfirmation(candidate.activeEvidence, "market_structure", "bullish")) {
        return "soft";
    }
    if (direction === "bearish" && !hasFamilyConfirmation(candidate.activeEvidence, "market_structure", "bearish")) {
        return "soft";
    }
    return "none";
};
export const calculateScoreBreakdown = (candidate, direction, resonance, lifecycleStage, regimeState) => {
    const discoveryScore = clamp(scoreEvidence(candidate.activeEvidence, "discovery", direction) / 2, 0, 1);
    const confirmationScore = clamp(scoreEvidence(candidate.activeEvidence, "confirmation", direction), 0, 1);
    const riskPenalty = clamp(scoreEvidence(candidate.activeEvidence, "risk") / 2.5, 0, 1);
    const corroborationBonus = corroborationBonusForDirection(candidate.activeEvidence, direction, defaultRouterConfig.thresholds.corroborationCap);
    const resonanceDirectionalFamilies = direction === "bullish"
        ? resonance.alignedBullishFamilies
        : resonance.alignedBearishFamilies;
    const resonanceBonus = clamp(resonanceDirectionalFamilies >= 2 ? resonance.resonanceScore : 0, 0, defaultRouterConfig.thresholds.resonanceCap);
    const regimeMultiplier = defaultRouterConfig.regimeMultipliers[regimeState];
    const lifecycleMultiplier = defaultRouterConfig.lifecycleMultipliers[lifecycleStage];
    const vetoState = determineVetoState(candidate, direction);
    let finalScore = clamp(confirmationScore * regimeMultiplier * lifecycleMultiplier +
        corroborationBonus +
        resonanceBonus -
        riskPenalty, 0, 1);
    if (vetoState === "hard") {
        finalScore = 0;
    }
    else if (vetoState === "soft") {
        finalScore = Math.min(finalScore, defaultRouterConfig.thresholds.watchlistScore + 0.05);
    }
    return {
        discoveryScore,
        confirmationScore,
        riskPenalty,
        corroborationBonus,
        resonanceBonus,
        regimeMultiplier,
        lifecycleMultiplier,
        vetoState,
        finalScore
    };
};
//# sourceMappingURL=scoring.js.map