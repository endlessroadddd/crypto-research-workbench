import { defaultRouterConfig } from "./config";
import { assessConflictSeverity, decisionForConflict } from "./conflict";
import { applyFreshness } from "./freshness";
import { calculateScoreBreakdown } from "./scoring";
import { dedupeSameFamily, computeResonance } from "./fusion";
import { classifyLifecycle } from "./lifecycle";
import { classifyRegime } from "./regime";
import { routeLana } from "./router-lana";
import { routeSkanda } from "./router-skanda";
import { unique } from "./utils";
import type {
  Candidate,
  CandidateInput,
  ConfidenceBand,
  EvaluationContext,
  RouterMode
} from "./types";

const confidenceBandForScore = (score: number): ConfidenceBand => {
  if (score >= defaultRouterConfig.thresholds.highConfidenceScore) {
    return "high";
  }

  if (score >= defaultRouterConfig.thresholds.watchlistScore) {
    return "medium";
  }

  return "low";
};

const determineModes = (candidate: Candidate): RouterMode[] => {
  const modes: RouterMode[] = [];

  if (candidate.regimeState !== "data_degraded") {
    modes.push("trend_long");
  }

  if (candidate.marketType !== "spot") {
    modes.push("exhaustion_short");
  }

  return modes;
};

export const evaluateCandidate = (
  input: CandidateInput,
  context: EvaluationContext
): Candidate => {
  const freshEvidence = applyFreshness(
    input.evidence,
    context.now,
    defaultRouterConfig.freshnessDegradingFloor
  );
  const evidence = dedupeSameFamily(freshEvidence);
  const activeEvidence = evidence.filter((item) => item.freshnessState !== "stale");
  const historicalEvidence = evidence.filter((item) => item.freshnessState === "stale");
  const lifecycleStage = classifyLifecycle(activeEvidence, input.marketType);
  const regimeState = classifyRegime(activeEvidence, context.sourceCoverage);
  const resonance = computeResonance(activeEvidence, defaultRouterConfig.thresholds.resonanceCap);

  const baseCandidate: Candidate = {
    symbol: input.symbol,
    baseAsset: input.baseAsset,
    quoteAsset: input.quoteAsset,
    chain: input.chain,
    contractAddresses: input.contractAddresses,
    marketType: input.marketType,
    lifecycleStage,
    regimeState,
    evidence,
    activeEvidence,
    historicalEvidence,
    sourceFamiliesSeen: unique(activeEvidence.map((item) => item.sourceFamily)),
    resonance,
    scoreBreakdown: {
      discoveryScore: 0,
      confirmationScore: 0,
      riskPenalty: 0,
      corroborationBonus: 0,
      resonanceBonus: 0,
      regimeMultiplier: 1,
      lifecycleMultiplier: 1,
      vetoState: "none",
      finalScore: 0
    },
    riskFlags: activeEvidence
      .filter((item) => item.category === "risk")
      .map((item) => item.subsource),
    degradedFlags: context.sourceCoverage
      .filter((item) => item.status !== "healthy")
      .map((item) => `${item.name}:${item.status}`)
      .concat(
        context.sourceCoverage
          .filter((item) => item.rateLimited)
          .map((item) => `${item.name}:rate_limited`)
      ),
    invalidators: activeEvidence
      .filter((item) => item.category === "veto")
      .map((item) => item.subsource),
    routerEligibleModes: [],
    routerDecision: "observe",
    confidenceBand: "low",
    manualReviewRequired: true,
    decisionReason: []
  };

  const longBreakdown = calculateScoreBreakdown(
    baseCandidate,
    "bullish",
    resonance,
    lifecycleStage,
    regimeState
  );
  const shortBreakdown = calculateScoreBreakdown(
    baseCandidate,
    "bearish",
    resonance,
    lifecycleStage,
    regimeState
  );

  const longCandidate = { ...baseCandidate, scoreBreakdown: longBreakdown };
  const shortCandidate = { ...baseCandidate, scoreBreakdown: shortBreakdown };

  const longDecision = routeLana(longCandidate);
  const shortDecision = routeSkanda(shortCandidate);
  const conflictSeverity = assessConflictSeverity(baseCandidate);

  let chosenDecision = longDecision;
  let chosenBreakdown = longBreakdown;
  let chosenReasons = [`lifecycle:${lifecycleStage}`, `regime:${regimeState}`];

  if (
    shortBreakdown.finalScore > longBreakdown.finalScore &&
    shortDecision !== "observe"
  ) {
    chosenDecision = shortDecision;
    chosenBreakdown = shortBreakdown;
    chosenReasons.push("router:skanda");
  } else {
    chosenReasons.push("router:lana");
  }

  if (chosenDecision === "observe" && shortDecision !== "observe") {
    chosenDecision = shortDecision;
    chosenBreakdown = shortBreakdown;
    chosenReasons.push("fallback:skanda");
  }

  chosenDecision = decisionForConflict(conflictSeverity, chosenDecision);

  if (regimeState === "range_distribution" && chosenDecision === "observe") {
    chosenDecision = "range_distribution_watch";
  }

  const routerEligibleModes = determineModes(baseCandidate);

  return {
    ...baseCandidate,
    routerEligibleModes,
    scoreBreakdown: chosenBreakdown,
    routerDecision: chosenDecision,
    confidenceBand: confidenceBandForScore(chosenBreakdown.finalScore),
    decisionReason: chosenReasons.concat(
      chosenBreakdown.vetoState !== "none" ? [`veto:${chosenBreakdown.vetoState}`] : [],
      conflictSeverity !== "none" ? [`conflict:${conflictSeverity}`] : [],
      chosenDecision === "watchlist" ? ["needs_confirmation"] : [],
      chosenDecision === "observe_cooloff_15m" ? ["cooloff_due_to_conflict"] : []
    )
  };
};

