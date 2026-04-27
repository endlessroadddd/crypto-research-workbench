import type {
  Candidate,
  LifecycleStage,
  RegimeState,
  RouterDecision,
  SourceCoverageItem,
  SourceFamily
} from "./types";

export type BeginnerRecommendation = "可轻仓做多" | "可轻仓做空" | "观望" | "不建议参与";
export type BeginnerDirection = "long" | "short" | "neutral";
export type BeginnerLevel = "高" | "中" | "低";

export interface BeginnerTradeReport {
  symbol: string;
  recommendation: BeginnerRecommendation;
  direction: BeginnerDirection;
  canOpenPosition: boolean;
  confidenceLevel: BeginnerLevel;
  riskLevel: BeginnerLevel;
  beginnerFriendly: boolean;
  oneLineSummary: string;
  reasons: string[];
  bullishReasons: string[];
  bearishReasons: string[];
  riskWarnings: string[];
  beginnerAdvice: string;
  finalVerdict: string;
  advanced: {
    finalScore: number;
    route: string;
    regime: string;
    lifecycle: string;
    evidenceCount: number;
    realtimeCoverage?: number;
  };
}

export interface BeginnerReportSummary {
  generatedAt: string;
  headline: string;
  overallRecommendation: "可以小仓试单" | "先观望" | "暂不建议开单";
  reason: string;
  advice: string;
  dataConfidence: BeginnerLevel;
  bestSymbol?: string;
  realtimeCoverage: number;
  reports: BeginnerTradeReport[];
}

const sourceFamilyLabels: Record<SourceFamily, string> = {
  market_structure: "价格结构",
  onchain_flow: "链上资金",
  rank_aggregator: "榜单热度",
  social_sentiment: "社区讨论",
  risk_annotation: "风险检查"
};

const regimeTranslations: Record<RegimeState, string> = {
  trend_expansion: "趋势正在走强",
  trend_mature: "趋势还在，但已经不是早期",
  range_chop: "震荡行情，方向不清",
  blowoff_exhaustion: "可能冲高回落",
  range_distribution: "可能高位派发",
  data_degraded: "数据不足，结论不可靠"
};

const lifecycleTranslations: Record<LifecycleStage, string> = {
  onchain_early: "早期阶段，波动大，风险高",
  cex_transition: "开始进入交易所关注阶段",
  cex_liquid: "流动性较成熟",
  late_speculative: "后期投机，追高风险大"
};

const routeTranslations: Record<RouterDecision, string> = {
  observe: "观察",
  observe_soft: "轻度观察",
  observe_cooloff_15m: "冷却观察 15 分钟",
  watchlist: "观察池",
  range_distribution_watch: "高位派发观察",
  trend_long_candidate: "趋势做多候选",
  short_candidate: "衰竭做空候选",
  veto: "否决"
};

const toPercent = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 100);

const unique = (values: string[]): string[] =>
  values.filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

export const getRealtimeCoverage = (sourceCoverage: SourceCoverageItem[]): number => {
  if (sourceCoverage.length === 0) {
    return 0;
  }

  return sourceCoverage.filter((source) => source.runtimeMode === "live").length / sourceCoverage.length;
};

export const hasDataQualityProblem = (
  candidate: Candidate,
  sourceCoverage: SourceCoverageItem[]
): {
  hard: boolean;
  soft: boolean;
  reasons: string[];
} => {
  const realtimeCoverage = getRealtimeCoverage(sourceCoverage);
  const liveSources = sourceCoverage.filter((source) => source.runtimeMode === "live").length;
  const coreStructureSources = sourceCoverage.filter((source) => source.family === "market_structure");
  const coreStructureUnavailable = coreStructureSources.some(
    (source) =>
      source.status === "stale" ||
      source.status === "unavailable" ||
      (!source.readiness && source.runtimeMode !== "fixture") ||
      (source.rateLimited && source.backoffLevel >= 2)
  );
  const degradedSources = sourceCoverage.filter((source) => source.status !== "healthy").length;

  const reasons: string[] = [];
  if (sourceCoverage.length === 0) {
    reasons.push("当前没有可用数据源。");
  }

  if (liveSources === 0) {
    reasons.push("当前实时源为 0，系统主要依赖快照或回退数据。");
  }

  if (realtimeCoverage < 0.3) {
    reasons.push(`实时数据覆盖率仅 ${toPercent(realtimeCoverage)}%，结论可靠性偏低。`);
  }

  if (coreStructureUnavailable) {
    reasons.push("关键价格结构源不可用、过期或仍在限流退避。");
  }

  if (candidate.regimeState === "data_degraded") {
    reasons.push("当前行情环境被系统判定为数据不足。");
  }

  if (degradedSources > 0) {
    reasons.push(`${degradedSources} 个数据源处于降级、过期或不可用状态。`);
  }

  return {
    hard:
      sourceCoverage.length === 0 ||
      liveSources === 0 ||
      realtimeCoverage < 0.3 ||
      coreStructureUnavailable ||
      candidate.regimeState === "data_degraded",
    soft: degradedSources > 0 || candidate.degradedFlags.length > 0,
    reasons: unique(reasons)
  };
};

const scoreConfidence = (score: number): BeginnerLevel => {
  if (score >= 80) {
    return "高";
  }

  if (score >= 60) {
    return "中";
  }

  return "低";
};

const scoreMeaning = (score: number): string => {
  if (score >= 80) {
    return "系统分数属于强信号，可以重点关注。";
  }

  if (score >= 60) {
    return "系统分数属于中等信号，即使参与也只能轻仓。";
  }

  if (score >= 40) {
    return "系统分数一般，更适合继续观察。";
  }

  if (score >= 20) {
    return "系统分数偏弱，不建议开单。";
  }

  return "系统分数很弱，明确不建议参与。";
};

const initialDecision = (
  decision: RouterDecision
): Pick<BeginnerTradeReport, "recommendation" | "direction" | "canOpenPosition"> => {
  if (decision === "trend_long_candidate") {
    return {
      recommendation: "可轻仓做多",
      direction: "long",
      canOpenPosition: true
    };
  }

  if (decision === "short_candidate") {
    return {
      recommendation: "可轻仓做空",
      direction: "short",
      canOpenPosition: true
    };
  }

  if (decision === "veto") {
    return {
      recommendation: "不建议参与",
      direction: "neutral",
      canOpenPosition: false
    };
  }

  return {
    recommendation: "观望",
    direction: "neutral",
    canOpenPosition: false
  };
};

const riskLevelFor = (
  candidate: Candidate,
  score: number,
  dataProblem: ReturnType<typeof hasDataQualityProblem>
): BeginnerLevel => {
  if (
    dataProblem.hard ||
    candidate.lifecycleStage === "late_speculative" ||
    candidate.regimeState === "blowoff_exhaustion" ||
    candidate.regimeState === "range_distribution" ||
    candidate.scoreBreakdown.riskPenalty >= 0.35 ||
    candidate.riskFlags.length + candidate.degradedFlags.length >= 3
  ) {
    return "高";
  }

  if (score < 60 || dataProblem.soft || candidate.scoreBreakdown.riskPenalty >= 0.15) {
    return "中";
  }

  return "低";
};

const evidenceReasonText = (candidate: Candidate, direction: "bullish" | "bearish"): string[] =>
  candidate.activeEvidence
    .filter((evidence) => evidence.direction === direction)
    .sort((left, right) => {
      const leftScore = left.strength * left.confidence * left.freshnessWeight;
      const rightScore = right.strength * right.confidence * right.freshnessWeight;
      return rightScore - leftScore;
    })
    .slice(0, 4)
    .map(
      (evidence) =>
        `${sourceFamilyLabels[evidence.sourceFamily]}出现${direction === "bullish" ? "偏多" : "偏空"}信号：${evidence.subsource}`
    );

const buildBeginnerAdvice = (
  reportBasis: Pick<BeginnerTradeReport, "recommendation" | "canOpenPosition" | "riskLevel">,
  dataProblem: ReturnType<typeof hasDataQualityProblem>
): string => {
  if (dataProblem.hard) {
    return "当前数据不足，不建议新手开单。先等实时数据恢复、价格结构更清晰，再重新评估。";
  }

  if (!reportBasis.canOpenPosition) {
    return "如果你是新手，现在不要急着碰这个币。把它放进观察列表，等系统给出更明确的方向。";
  }

  if (reportBasis.riskLevel === "高") {
    return "即使系统给出方向，风险也偏高。新手不建议参与；有经验也只能小仓、短拿、严格止损。";
  }

  return "如果你一定要参与，只能轻仓，并且先写好止损和失效条件。本系统不会替你自动下单。";
};

export const buildBeginnerTradeReport = (
  candidate: Candidate,
  sourceCoverage: SourceCoverageItem[]
): BeginnerTradeReport => {
  const score = toPercent(candidate.scoreBreakdown.finalScore);
  const realtimeCoverage = toPercent(getRealtimeCoverage(sourceCoverage));
  const dataProblem = hasDataQualityProblem(candidate, sourceCoverage);
  const decision = initialDecision(candidate.routerDecision);
  const reasons = [
    scoreMeaning(score),
    `当前行情状态：${regimeTranslations[candidate.regimeState]}。`,
    `币种阶段：${lifecycleTranslations[candidate.lifecycleStage]}。`,
    ...dataProblem.reasons
  ];

  let recommendation = decision.recommendation;
  let canOpenPosition = decision.canOpenPosition;
  let confidenceLevel = scoreConfidence(score);

  if (dataProblem.hard) {
    recommendation = "不建议参与";
    canOpenPosition = false;
    confidenceLevel = "低";
  } else if (score < 40 && recommendation !== "不建议参与") {
    recommendation = "观望";
    canOpenPosition = false;
    confidenceLevel = "低";
  } else if (score < 60 && decision.canOpenPosition) {
    recommendation = "观望";
    canOpenPosition = false;
  }

  const riskWarnings = unique([
    ...candidate.riskFlags,
    ...candidate.degradedFlags,
    ...candidate.invalidators,
    ...dataProblem.reasons
  ]).slice(0, 8);
  const riskLevel = riskLevelFor(candidate, score, dataProblem);
  const beginnerFriendly = canOpenPosition && riskLevel !== "高" && confidenceLevel !== "低";
  const basis = {
    recommendation,
    canOpenPosition,
    riskLevel
  };
  const beginnerAdvice = buildBeginnerAdvice(basis, dataProblem);
  const bullishReasons = evidenceReasonText(candidate, "bullish");
  const bearishReasons = evidenceReasonText(candidate, "bearish");
  const symbol = candidate.baseAsset ?? candidate.symbol;
  const oneLineSummary =
    recommendation === "可轻仓做多"
      ? `${symbol} 目前偏多，但只适合轻仓试单。`
      : recommendation === "可轻仓做空"
        ? `${symbol} 可能冲高回落，但做空必须快进快出。`
        : recommendation === "观望"
          ? `${symbol} 暂时没有足够清晰的开单条件，先观望。`
          : `${symbol} 当前不适合新手参与。`;
  const finalVerdict = `${symbol} 当前建议：${recommendation}。${canOpenPosition ? "只允许人工轻仓复核后再考虑，不允许重仓或无止损开单。" : "现在不要为了交易而交易，等待更明确的信号。"} 本系统仅用于交易研究辅助，不构成投资建议。`;

  return {
    symbol,
    recommendation,
    direction: canOpenPosition ? decision.direction : "neutral",
    canOpenPosition,
    confidenceLevel,
    riskLevel,
    beginnerFriendly,
    oneLineSummary,
    reasons: unique(reasons).slice(0, 8),
    bullishReasons: bullishReasons.length > 0 ? bullishReasons : ["暂未发现足够明确的看多证据。"],
    bearishReasons: bearishReasons.length > 0 ? bearishReasons : ["暂未发现足够明确的看空证据。"],
    riskWarnings: riskWarnings.length > 0 ? riskWarnings : ["未发现额外风险标签，但仍需自行控制仓位。"],
    beginnerAdvice,
    finalVerdict,
    advanced: {
      finalScore: score,
      route: routeTranslations[candidate.routerDecision],
      regime: regimeTranslations[candidate.regimeState],
      lifecycle: lifecycleTranslations[candidate.lifecycleStage],
      evidenceCount: candidate.activeEvidence.length,
      realtimeCoverage
    }
  };
};

export const buildBeginnerReportSummary = (
  candidates: Candidate[],
  sourceCoverage: SourceCoverageItem[],
  generatedAt = new Date().toISOString()
): BeginnerReportSummary => {
  const reports = candidates.map((candidate) => buildBeginnerTradeReport(candidate, sourceCoverage));
  const realtimeCoverage = toPercent(getRealtimeCoverage(sourceCoverage));
  const openableReports = reports.filter((report) => report.canOpenPosition);
  const bestReport = [...reports].sort((left, right) => right.advanced.finalScore - left.advanced.finalScore)[0];
  const highRiskOrNoLive =
    sourceCoverage.length === 0 ||
    sourceCoverage.every((source) => source.runtimeMode !== "live") ||
    sourceCoverage.some((source) => source.status === "stale" || source.status === "unavailable");

  if (highRiskOrNoLive) {
    return {
      generatedAt,
      headline: "今日结论：暂不建议开单",
      overallRecommendation: "暂不建议开单",
      reason: "当前实时数据覆盖不足或关键源存在降级，系统结论不适合直接用于新手开单。",
      advice: "今天先观望，不要为了交易而交易。等待实时源恢复、结构信号更明确后再看。",
      dataConfidence: "低",
      bestSymbol: bestReport?.symbol,
      realtimeCoverage,
      reports
    };
  }

  if (openableReports.length === 0) {
    return {
      generatedAt,
      headline: "今日结论：先观望",
      overallRecommendation: "先观望",
      reason: "当前没有明确的做多或做空候选，系统只发现观察类标的。",
      advice: "把高分观察标的加入关注，不要抢在结构确认前开单。",
      dataConfidence: realtimeCoverage >= 70 ? "中" : "低",
      bestSymbol: bestReport?.symbol,
      realtimeCoverage,
      reports
    };
  }

  return {
    generatedAt,
    headline: "今日结论：可以小仓复核",
    overallRecommendation: "可以小仓试单",
    reason: `系统发现 ${openableReports.length} 个可人工复核的轻仓候选，但仍需自己确认止损和失效条件。`,
    advice: "只看轻仓机会，不要重仓，不要自动下单，不要把研究信号当成确定收益。",
    dataConfidence: realtimeCoverage >= 70 ? "高" : "中",
    bestSymbol: openableReports[0]?.symbol ?? bestReport?.symbol,
    realtimeCoverage,
    reports
  };
};
