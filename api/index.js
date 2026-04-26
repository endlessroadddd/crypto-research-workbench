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
