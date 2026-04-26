import type { Evidence, LifecycleStage } from "./types";

const scoreFamily = (evidence: Evidence[], family: Evidence["sourceFamily"]): number =>
  evidence
    .filter((item) => item.sourceFamily === family && item.freshnessState !== "stale")
    .reduce((sum, item) => sum + item.freshnessWeight * item.strength * item.confidence, 0);

export const classifyLifecycle = (
  evidence: Evidence[],
  marketType: "spot" | "perp" | "both"
): LifecycleStage => {
  const structure = scoreFamily(evidence, "market_structure");
  const onchain = scoreFamily(evidence, "onchain_flow");
  const social = scoreFamily(evidence, "social_sentiment");
  const ranks = scoreFamily(evidence, "rank_aggregator");

  const lateHeat = social + ranks >= 2.6;
  const transition = onchain >= 0.75 && structure >= 0.5;

  if (lateHeat && structure >= 0.6) {
    return "late_speculative";
  }

  if (onchain >= 1.2 && structure < 0.5 && marketType !== "perp") {
    return "onchain_early";
  }

  if (transition) {
    return "cex_transition";
  }

  return "cex_liquid";
};

