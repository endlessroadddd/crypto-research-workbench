import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : process.cwd();
const roots = [
  process.cwd(),
  join(process.cwd(), ".."),
  join(process.cwd(), "../.."),
  moduleDir,
  join(moduleDir, ".."),
  join(moduleDir, "../.."),
  "/var/task"
];
const reviews = new Map();

const readJson = (path, fallback) => {
  for (const root of roots) {
    const candidatePath = join(root, path);
    if (!existsSync(candidatePath)) {
      continue;
    }

    try {
      return JSON.parse(readFileSync(candidatePath, "utf8"));
    } catch {
      return fallback;
    }
  }

  return fallback;
};

const candidates = () =>
  readJson("fixtures/snapshots/current-candidates.json", []);

const calibrationReport = () =>
  readJson("fixtures/snapshots/review-calibration-report.json", {
    totalReviews: 0,
    thesisAcceptanceRate: 0,
    timingAcceptanceRate: 0,
    actionBreakdown: {
      dismiss: 0,
      watch: 0,
      "long-bias": 0,
      "short-bias": 0
    }
  });

const structureSnapshots = () =>
  readJson("fixtures/snapshots/structure-window-latest.json", []);

const send = (response, statusCode, payload, headers = {}) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
};

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
};

const findCandidate = (symbol) =>
  candidates().find((candidate) => candidate.symbol.toUpperCase() === symbol.toUpperCase());

const buildChecklist = (candidate) => ({
  whyInPool: candidate.decisionReason ?? [],
  bullishFactors: (candidate.activeEvidence ?? [])
    .filter((item) => item.direction === "bullish" && item.category !== "risk")
    .map((item) => `${item.sourceFamily}:${item.subsource}`),
  bearishFactors: (candidate.activeEvidence ?? [])
    .filter((item) => item.direction === "bearish" && item.category !== "risk")
    .map((item) => `${item.sourceFamily}:${item.subsource}`),
  riskFactors: candidate.riskFlags ?? [],
  dataGaps: candidate.degradedFlags ?? [],
  staleSources: (candidate.historicalEvidence ?? []).map((item) => item.source),
  unresolvedConflicts: (candidate.decisionReason ?? []).filter((item) => item.startsWith("conflict:")),
  recommendedAction:
    candidate.routerDecision === "trend_long_candidate"
      ? "possible-long"
      : candidate.routerDecision === "short_candidate"
        ? "possible-short"
        : candidate.routerDecision === "watchlist" ||
            candidate.routerDecision === "range_distribution_watch"
          ? "watch-closely"
          : "observe"
});

const sourceCoverage = () => [
  {
    name: "vercel-static-snapshot",
    family: "market_structure",
    installProfile: "active-only",
    installState: "installed_active",
    runtimeMode: "fixture",
    readiness: true,
    pinnedVersion: "vercel",
    pinnedSha: "snapshot",
    lastUpdated: new Date().toISOString(),
    status: "degraded",
    rateLimited: false,
    retrying: false,
    backoffLevel: 0,
    samplePayloadAvailable: true,
    errors: ["Vercel demo uses committed snapshots; live CLI sources run locally."]
  }
];

const realtimeCoverage = () => {
  const sources = sourceCoverage();
  if (sources.length === 0) {
    return 0;
  }

  return Math.round((sources.filter((source) => source.runtimeMode === "live").length / sources.length) * 100);
};

const regimeText = {
  trend_expansion: "趋势正在走强",
  trend_mature: "趋势还在，但已经不是早期",
  range_chop: "震荡行情，方向不清",
  blowoff_exhaustion: "可能冲高回落",
  range_distribution: "可能高位派发",
  data_degraded: "数据不足，结论不可靠"
};

const lifecycleText = {
  onchain_early: "早期阶段，波动大，风险高",
  cex_transition: "开始进入交易所关注阶段",
  cex_liquid: "流动性较成熟",
  late_speculative: "后期投机，追高风险大"
};

const routeText = {
  observe: "观察",
  observe_soft: "轻度观察",
  observe_cooloff_15m: "冷却观察 15 分钟",
  watchlist: "观察池",
  range_distribution_watch: "高位派发观察",
  trend_long_candidate: "趋势做多候选",
  short_candidate: "衰竭做空候选",
  veto: "否决"
};

const evidenceReasons = (candidate, direction) =>
  (candidate.activeEvidence ?? [])
    .filter((item) => item.direction === direction)
    .slice(0, 4)
    .map((item) => `${item.sourceFamily} 出现${direction === "bullish" ? "偏多" : "偏空"}信号：${item.subsource}`);

const scoreText = (score) => {
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

const dataWarnings = (candidate) => {
  const coverage = realtimeCoverage();
  const sources = sourceCoverage();
  const warnings = [];
  if (coverage < 30) {
    warnings.push(`实时数据覆盖率仅 ${coverage}%，结论可靠性偏低。`);
  }
  if (sources.every((source) => source.runtimeMode !== "live")) {
    warnings.push("当前实时源为 0，系统主要依赖快照或回退数据。");
  }
  if (sources.some((source) => source.status === "stale" || source.status === "unavailable")) {
    warnings.push("存在过期或不可用的数据源。");
  }
  if (candidate.regimeState === "data_degraded") {
    warnings.push("当前行情环境被系统判定为数据不足。");
  }
  return warnings;
};

const beginnerReport = (candidate) => {
  const score = Math.round((candidate.scoreBreakdown?.finalScore ?? 0) * 100);
  const warnings = dataWarnings(candidate);
  const dataHard = warnings.length > 0;
  const base =
    candidate.routerDecision === "trend_long_candidate"
      ? { recommendation: "可轻仓做多", direction: "long", canOpenPosition: true }
      : candidate.routerDecision === "short_candidate"
        ? { recommendation: "可轻仓做空", direction: "short", canOpenPosition: true }
        : candidate.routerDecision === "veto"
          ? { recommendation: "不建议参与", direction: "neutral", canOpenPosition: false }
          : { recommendation: "观望", direction: "neutral", canOpenPosition: false };
  const recommendation = dataHard ? "不建议参与" : score < 40 ? "观望" : base.recommendation;
  const canOpenPosition = dataHard ? false : score >= 60 && base.canOpenPosition;
  const confidenceLevel = dataHard || score < 60 ? "低" : score >= 80 ? "高" : "中";
  const riskLevel =
    dataHard ||
    candidate.lifecycleStage === "late_speculative" ||
    candidate.regimeState === "range_distribution" ||
    candidate.regimeState === "blowoff_exhaustion"
      ? "高"
      : score >= 70
        ? "中"
        : "高";
  const symbol = candidate.baseAsset ?? candidate.symbol;
  const oneLineSummary =
    recommendation === "可轻仓做多"
      ? `${symbol} 目前偏多，但只适合轻仓试单。`
      : recommendation === "可轻仓做空"
        ? `${symbol} 可能冲高回落，但做空必须快进快出。`
        : recommendation === "观望"
          ? `${symbol} 暂时没有足够清晰的开单条件，先观望。`
          : `${symbol} 当前不适合新手参与。`;

  return {
    symbol,
    recommendation,
    direction: canOpenPosition ? base.direction : "neutral",
    canOpenPosition,
    confidenceLevel,
    riskLevel,
    beginnerFriendly: canOpenPosition && riskLevel !== "高" && confidenceLevel !== "低",
    oneLineSummary,
    reasons: [
      scoreText(score),
      `当前行情状态：${regimeText[candidate.regimeState] ?? candidate.regimeState}。`,
      `币种阶段：${lifecycleText[candidate.lifecycleStage] ?? candidate.lifecycleStage}。`,
      ...warnings
    ],
    bullishReasons: evidenceReasons(candidate, "bullish").length
      ? evidenceReasons(candidate, "bullish")
      : ["暂未发现足够明确的看多证据。"],
    bearishReasons: evidenceReasons(candidate, "bearish").length
      ? evidenceReasons(candidate, "bearish")
      : ["暂未发现足够明确的看空证据。"],
    riskWarnings: [
      ...(candidate.riskFlags ?? []),
      ...(candidate.degradedFlags ?? []),
      ...(candidate.invalidators ?? []),
      ...warnings
    ].slice(0, 8),
    beginnerAdvice: dataHard
      ? "当前数据不足，不建议新手开单。先等实时数据恢复、价格结构更清晰，再重新评估。"
      : canOpenPosition
        ? "如果你一定要参与，只能轻仓，并且先写好止损和失效条件。本系统不会替你自动下单。"
        : "如果你是新手，现在不要急着碰这个币。把它放进观察列表，等系统给出更明确的方向。",
    finalVerdict: `${symbol} 当前建议：${recommendation}。${canOpenPosition ? "只允许人工轻仓复核后再考虑，不允许重仓或无止损开单。" : "现在不要为了交易而交易，等待更明确的信号。"} 本系统仅用于交易研究辅助，不构成投资建议。`,
    advanced: {
      finalScore: score,
      route: routeText[candidate.routerDecision] ?? candidate.routerDecision,
      regime: regimeText[candidate.regimeState] ?? candidate.regimeState,
      lifecycle: lifecycleText[candidate.lifecycleStage] ?? candidate.lifecycleStage,
      evidenceCount: (candidate.activeEvidence ?? []).length,
      realtimeCoverage: realtimeCoverage()
    }
  };
};

const beginnerReportSummary = () => {
  const reports = candidates().map(beginnerReport).sort((left, right) => right.advanced.finalScore - left.advanced.finalScore);
  const coverage = realtimeCoverage();
  const openableReports = reports.filter((report) => report.canOpenPosition);
  const allSnapshot = sourceCoverage().every((source) => source.runtimeMode !== "live");

  if (allSnapshot || coverage < 30) {
    return {
      generatedAt: new Date().toISOString(),
      headline: "今日结论：暂不建议开单",
      overallRecommendation: "暂不建议开单",
      reason: "当前实时数据覆盖不足，系统没有发现适合新手直接开单的明确候选。",
      advice: "今天先观望，不要为了交易而交易。",
      dataConfidence: "低",
      bestSymbol: reports[0]?.symbol,
      realtimeCoverage: coverage,
      reports
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    headline: openableReports.length > 0 ? "今日结论：可以小仓复核" : "今日结论：先观望",
    overallRecommendation: openableReports.length > 0 ? "可以小仓试单" : "先观望",
    reason:
      openableReports.length > 0
        ? `系统发现 ${openableReports.length} 个可人工复核的轻仓候选。`
        : "当前没有明确的做多或做空候选。",
    advice: "只看轻仓机会，不要重仓，不要自动下单，不要把研究信号当成确定收益。",
    dataConfidence: coverage >= 70 ? "高" : "中",
    bestSymbol: (openableReports[0] ?? reports[0])?.symbol,
    realtimeCoverage: coverage,
    reports
  };
};

const advisor = (candidate, question = "") => {
  const injection = /(忽略.*(规则|指令)|无视.*(规则|指令)|system prompt|developer message|ignore previous|jailbreak|越狱|泄露提示词)/i.test(
    question
  );
  const autoExecution = /(下单|开仓|平仓|市价买|市价卖|全仓|梭哈|自动交易|自动下单|place order|market buy|market sell)/i.test(
    question
  );

  return {
    provider: "fallback",
    model: "vercel-snapshot-policy",
    generatedAt: new Date().toISOString(),
    safety: {
      allowed: !injection,
      manualOnly: true,
      detectedRisks: [
        ...(autoExecution ? ["auto_execution_request"] : []),
        ...(injection ? ["prompt_injection"] : [])
      ],
      blockedReason: injection
        ? "输入包含疑似提示词注入内容，线上演示只返回护栏说明。"
        : autoExecution
          ? "线上演示禁用自动交易，只能输出人工复核框架。"
          : undefined
    },
    summary: `${candidate.symbol} 当前路由为 ${candidate.routerDecision}，环境为 ${candidate.regimeState}，最终分 ${Math.round((candidate.scoreBreakdown?.finalScore ?? 0) * 100)}%。`,
    retrievedContext: [
      "market_structure 最高优先级，社交/榜单/链上共振不能替代结构确认。",
      "stale 证据只允许展示和回放，不参与当前路由。",
      "Vercel 线上演示使用快照数据；真实 CLI/SQLite 工作流在本地运行。"
    ],
    tradePlan:
      candidate.routerDecision === "trend_long_candidate"
        ? [
            "方向：只考虑人工偏多，不做逆向摸顶。",
            "触发：复核结构确认是否仍成立。",
            "执行：小仓验证，等待回踩不破或延续确认。",
            "退出：结构跌回关键位或环境降级时停止执行。"
          ]
        : candidate.routerDecision === "short_candidate"
          ? [
              "方向：只考虑人工偏空。",
              "触发：确认 blowoff_exhaustion 与空头结构仍成立。",
              "执行：失败反抽或关键位无法收复时人工评估。",
              "退出：关键位收复或结构源降级时停止执行。"
            ]
          : [
              "方向：当前只观察。",
              "触发：等待 market_structure confirmation。",
              "执行：没有高置信路由前不下单。",
              "退出观察：证据过期或出现 hard veto。"
            ],
    checklist: buildChecklist(candidate).whyInPool,
    evidenceUsed: (candidate.activeEvidence ?? [])
      .slice(0, 6)
      .map((item) => `${item.sourceFamily}/${item.category}/${item.direction}: ${item.subsource}`),
    invalidationRules: [
      ...(candidate.invalidators ?? []).map((item) => `否决条件：${item}`),
      ...(candidate.degradedFlags ?? []).map((item) => `数据降级：${item}`),
      "系统不提供自动下单、自动仓位管理或收益承诺。"
    ]
  };
};

export default async function handler(request, response) {
  const url = new URL(request.url ?? "/", "https://vercel.local");
  const path = url.pathname.replace(/\/$/, "");

  if (path === "/api/source-coverage" && request.method === "GET") {
    return send(response, 200, sourceCoverage());
  }

  if (path === "/api/readiness" && request.method === "GET") {
    return send(response, 200, sourceCoverage().map((item) => ({
      source: item.name,
      readiness: item.readiness ? 1 : 0,
      errors: item.errors
    })));
  }

  if (path === "/api/candidates" && request.method === "GET") {
    return send(response, 200, candidates());
  }

  if (path === "/api/reports" && request.method === "GET") {
    return send(response, 200, beginnerReportSummary());
  }

  const reportMatch = path.match(/^\/api\/candidates\/([^/]+)\/report$/);
  if (reportMatch && request.method === "GET") {
    const candidate = findCandidate(decodeURIComponent(reportMatch[1]));
    if (!candidate) {
      return send(response, 404, { message: "Report not found" });
    }

    return send(response, 200, beginnerReport(candidate));
  }

  const candidateMatch = path.match(/^\/api\/candidates\/([^/]+)(?:\/replay)?$/);
  if (candidateMatch && request.method === "GET") {
    const candidate = findCandidate(decodeURIComponent(candidateMatch[1]));
    if (!candidate) {
      return send(response, 404, { message: "Candidate not found" });
    }

    const checklist = buildChecklist(candidate);
    const manualReviews = reviews.get(candidate.symbol) ?? [];

    if (path.endsWith("/replay")) {
      return send(response, 200, {
        liveEventReplay: {
          symbol: candidate.symbol,
          candidate,
          manualReviews
        },
        historicalSnapshotReplay: structureSnapshots().filter((item) => item.symbol === candidate.symbol),
        manualReviewChecklist: checklist,
        calibrationReport: calibrationReport()
      });
    }

    return send(response, 200, {
      candidate,
      checklist,
      reviews: manualReviews
    });
  }

  if (path === "/api/ai/analyze" && request.method === "POST") {
    const body = await readBody(request);
    const candidate = body.symbol ? findCandidate(String(body.symbol)) : null;
    if (!candidate) {
      return send(response, 404, { message: "Candidate not found" });
    }

    return send(response, 200, advisor(candidate, String(body.question ?? "")));
  }

  if (path === "/api/manual-review" && request.method === "POST") {
    const body = await readBody(request);
    const candidateId = String(body.candidateId ?? "");
    const current = reviews.get(candidateId) ?? [];
    reviews.set(candidateId, [...current, body]);
    return send(response, 200, {
      ok: true,
      calibrationReport: calibrationReport()
    });
  }

  if (path === "/api/admin/recompute" && request.method === "POST") {
    return send(response, 200, {
      generatedAt: new Date().toISOString(),
      sourceCount: sourceCoverage().length,
      candidateCount: candidates().length
    });
  }

  if (path === "/api/decision-stream" && request.method === "GET") {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "close"
    });
    response.end(`event: refresh\ndata: ${JSON.stringify({ now: new Date().toISOString() })}\n\n`);
    return;
  }

  return send(response, 404, { message: "Not found" });
}
