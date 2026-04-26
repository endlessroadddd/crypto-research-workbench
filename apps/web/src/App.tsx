import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type CSSProperties
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Candidate,
  ConfidenceBand,
  Evidence,
  EvidenceCategory,
  ManualReviewFeedback,
  RegimeState,
  RouterDecision,
  SourceCoverageItem,
  SourceFamily
} from "@research/core";
import type { AiAdvisorResponse, CandidateDetailResponse, CandidateReplayResponse } from "./api";
import {
  fetchCandidateDetail,
  fetchCandidateReplay,
  fetchCandidates,
  fetchSourceCoverage,
  postAiAnalysis,
  postManualReview
} from "./api";
import "./styles.css";

type DecisionFilter =
  | "all"
  | "actionable"
  | "trend_long_candidate"
  | "short_candidate"
  | "watch";

type DetailTab = "execution" | "advisor" | "overview" | "evidence" | "timeline" | "review";

interface TimelineItem {
  id: string;
  timestamp: string;
  tone: "bull" | "bear" | "warning" | "neutral";
  title: string;
  subtitle: string;
  footnote: string;
}

const FAMILY_ORDER: SourceFamily[] = [
  "market_structure",
  "onchain_flow",
  "rank_aggregator",
  "social_sentiment",
  "risk_annotation"
];

const CATEGORY_ORDER: EvidenceCategory[] = ["discovery", "confirmation", "risk", "veto"];

const DECISION_PRIORITY: Record<RouterDecision, number> = {
  trend_long_candidate: 0,
  short_candidate: 1,
  range_distribution_watch: 2,
  watchlist: 3,
  observe_soft: 4,
  observe_cooloff_15m: 5,
  observe: 6,
  veto: 7
};

const familyLabels: Record<SourceFamily, string> = {
  market_structure: "结构流",
  onchain_flow: "链上流",
  rank_aggregator: "榜单聚合",
  social_sentiment: "舆情热度",
  risk_annotation: "风险注记"
};

const categoryLabels: Record<EvidenceCategory, string> = {
  discovery: "发现",
  confirmation: "确认",
  risk: "风险",
  veto: "否决"
};

const decisionLabels: Record<RouterDecision, string> = {
  observe: "观察",
  observe_soft: "轻观察",
  observe_cooloff_15m: "冷却 15 分钟",
  watchlist: "观察池",
  range_distribution_watch: "区间派发观察",
  trend_long_candidate: "趋势多候选",
  short_candidate: "衰竭空候选",
  veto: "否决"
};

const confidenceLabels: Record<ConfidenceBand, string> = {
  low: "低",
  medium: "中",
  high: "高"
};

const lifecycleLabels: Record<Candidate["lifecycleStage"], string> = {
  onchain_early: "链上早期",
  cex_transition: "上所过渡",
  cex_liquid: "CEX 流动期",
  late_speculative: "末端投机"
};

const regimeLabels: Record<RegimeState, string> = {
  trend_expansion: "趋势扩张",
  trend_mature: "趋势成熟",
  range_chop: "区间震荡",
  blowoff_exhaustion: "加速衰竭",
  range_distribution: "区间派发",
  data_degraded: "数据降级"
};

const directionLabels: Record<Evidence["direction"], string> = {
  bullish: "偏多",
  bearish: "偏空",
  neutral: "中性",
  risk: "风险"
};

const tabLabels: Record<DetailTab, string> = {
  execution: "执行卡",
  advisor: "AI 助手",
  overview: "总览",
  evidence: "证据",
  timeline: "回放时间线",
  review: "人工复核"
};

const installStateLabels: Record<SourceCoverageItem["installState"], string> = {
  installed_active: "已启用",
  installed_dormant: "已休眠",
  not_installed: "未安装",
  forbidden_for_scoring: "禁止计分"
};

const runtimeModeLabels: Record<SourceCoverageItem["runtimeMode"], string> = {
  live: "实时",
  fixture: "快照回退",
  unavailable: "不可用"
};

const sourceStatusLabels: Record<SourceCoverageItem["status"], string> = {
  healthy: "健康",
  degraded: "降级",
  stale: "过期",
  unavailable: "不可用"
};

const reviewActionLabels: Record<ManualReviewFeedback["reviewerAction"], string> = {
  watch: "继续观察",
  dismiss: "排除",
  "long-bias": "偏多",
  "short-bias": "偏空"
};

const recommendedActionLabels: Record<CandidateDetailResponse["checklist"]["recommendedAction"], string> = {
  observe: "观察",
  "watch-closely": "重点观察",
  "possible-long": "可偏多",
  "possible-short": "可偏空"
};

const decisionClassName = (decision: RouterDecision): string => `signal-pill decision ${decision}`;
const confidenceClassName = (value: ConfidenceBand): string => `signal-pill confidence ${value}`;
const freshnessClassName = (value: Evidence["freshnessState"]): string =>
  `signal-pill freshness ${value}`;
const categoryClassName = (value: EvidenceCategory): string => `signal-pill category ${value}`;
const familyClassName = (value: SourceFamily): string => `signal-pill family ${value}`;
const sourceStatusClassName = (item: SourceCoverageItem): string =>
  `signal-pill source-status ${item.status} ${item.readiness ? "ready" : "not-ready"}`;

const compactRatio = (value: number): string => `${Math.round(value * 100)}%`;

const formatTimestamp = (value?: string): string => {
  if (!value) {
    return "暂无";
  }

  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const shortAddress = (value?: string): string =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "未解析";

const displaySymbol = (candidate: Candidate): string => candidate.baseAsset ?? candidate.symbol;

const displayCandidateId = (candidate: Candidate): string | null =>
  candidate.symbol !== displaySymbol(candidate) ? candidate.symbol : null;

const formatSourceError = (value: string): string => {
  if (value.includes("using cached snapshot fallback")) {
    return "实时源失败，已切回快照";
  }

  if (value.includes("missing")) {
    return "本机缺少对应 CLI";
  }

  if (value.includes("Request failed after 3 retries")) {
    return "请求连续重试失败";
  }

  if (value.includes("Failed to call OKX endpoint")) {
    return "OKX 交易所公网不可达";
  }

  return value;
};

const formatDecisionReason = (reason: string): string => {
  if (reason.startsWith("lifecycle:")) {
    const value = reason.replace("lifecycle:", "") as Candidate["lifecycleStage"];
    return `生命周期：${lifecycleLabels[value] ?? value}`;
  }

  if (reason.startsWith("regime:")) {
    const value = reason.replace("regime:", "") as RegimeState;
    return `环境：${regimeLabels[value] ?? value}`;
  }

  if (reason.startsWith("router:")) {
    return reason.endsWith("skanda") ? "路由：Skanda" : "路由：Lana";
  }

  if (reason.startsWith("fallback:")) {
    return "回退：改用 Skanda";
  }

  if (reason.startsWith("veto:")) {
    return reason.endsWith("hard") ? "硬否决" : "软否决";
  }

  if (reason.startsWith("conflict:")) {
    return `源冲突：${reason.replace("conflict:", "")}`;
  }

  if (reason === "needs_confirmation") {
    return "等待结构确认";
  }

  if (reason === "cooloff_due_to_conflict") {
    return "冲突冷却";
  }

  return reason.replaceAll("_", " ");
};

const SEARCH_STOPWORDS = new Set([
  "分析",
  "查看",
  "看下",
  "看一看",
  "分析下",
  "分析一下",
  "代币",
  "币",
  "这个",
  "一下",
  "token",
  "analyze",
  "analyse",
  "analysis",
  "trade",
  "trading",
  "long",
  "short",
  "做多",
  "做空"
]);

const parseSearchTokens = (value: string): string[] =>
  value
    .replace(/[，。、“”‘’！？!?,./\\|()[\]{}:;]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !SEARCH_STOPWORDS.has(token.toLowerCase()))
    .map((token) => token.toUpperCase());

const formatQueryError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "请求失败，请检查本地 API 与代理链路。";
};

const getLatestTimestamp = (values: Array<string | undefined>): string | undefined => {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...timestamps)).toISOString();
};

const buildCoverageSummary = (coverage: SourceCoverageItem[]) => {
  const live = coverage.filter((item) => item.runtimeMode === "live").length;
  const fallback = coverage.filter((item) => item.runtimeMode === "fixture").length;
  const degraded = coverage.filter((item) => item.status !== "healthy").length;
  const latest = getLatestTimestamp(coverage.map((item) => item.lastUpdated));

  return {
    live,
    fallback,
    degraded,
    latest,
    total: coverage.length
  };
};

const buildExecutionGuide = (
  candidate: Candidate,
  checklist: CandidateDetailResponse["checklist"]
): {
  headline: string;
  bias: string;
  cadence: string;
  summary: string;
  steps: string[];
  noTrade: string[];
  triggerSummary: string[];
} => {
  const triggerSummary =
    candidate.activeEvidence
      .filter((item) => item.category === "confirmation" || item.category === "discovery")
      .slice(0, 4)
      .map((item) => `${categoryLabels[item.category]} · ${item.subsource}`) ?? [];

  if (candidate.routerDecision === "trend_long_candidate") {
    return {
      headline: "顺势偏多执行",
      bias: "只考虑顺势做多，不做逆向摸顶。",
      cadence: "每 15 分钟复评一次",
      summary:
        "这是一张 Lana 风格的趋势跟随卡。只有结构确认还在、环境没有退化，才允许你手动试多。",
      steps: [
        "先确认结构流仍然给出多头 confirmation，且不是 stale / unavailable。",
        "优先等回踩不破、重新站稳或延续确认后再手动试单，不要因为热度高直接追最后一脚。",
        "先用小仓验证结构，只有当候选仍维持 trend_long_candidate 且 finalScore 稳定时，才考虑加仓。",
        "如果环境从趋势扩张 / 趋势成熟掉回观察态，或者关键结构被跌回去，立即退出。"
      ],
      noTrade: [
        "只有热度、榜单或 smart-money 噪音，没有结构确认。",
        "生命周期已经进入末端投机，或者环境退化成区间 / 数据降级。",
        ...candidate.degradedFlags.slice(0, 2)
      ],
      triggerSummary
    };
  }

  if (candidate.routerDecision === "short_candidate") {
    return {
      headline: "衰竭偏空执行",
      bias: "只在衰竭结构明确后考虑手动做空，不因为热度高就空。",
      cadence: "每 5 分钟复评一次",
      summary:
        "这是一张 Skanda 风格的衰竭反向卡。只有 blowoff exhaustion 和失败反抽都成立，才允许你去做空。",
      steps: [
        "先确认当前还是 blowoff_exhaustion，并且有 market_structure 的空头 confirmation。",
        "只在失败反抽、冲高回落、关键位无法收复时手动试空；没有结构衰竭就不要开空。",
        "小仓试单，优先短拿快跑，不把它当趋势空长持。",
        "一旦关键位被重新收复、路由掉回观察态，或者现货/催化重新增强，立即退出。"
      ],
      noTrade: [
        "仍然是强趋势推进，只是情绪很热。",
        "流动性太差，滑点和冲击成本会毁掉计划。",
        ...candidate.degradedFlags.slice(0, 2)
      ],
      triggerSummary
    };
  }

  return {
    headline: "先观察，不执行",
    bias: "当前还不是下单卡，最多进入观察清单。",
    cadence: "等待新的结构确认",
    summary:
      "这类候选还没有给到足够清晰的手动执行条件。正确动作不是脑补，而是继续观察结构、热度和环境是否继续演变。",
    steps: [
      "把它放在观察池里，等待更多 confirmation，而不是抢先下单。",
      "只要结构没有明确转成 trend_long_candidate 或 short_candidate，就不执行。",
      "把回放时间线和证据页看完，确认是不是只是热度堆叠，而不是可交易结构。"
    ],
    noTrade: [
      "当前路由不是高置信交易候选。",
      "信号仍存在冲突、数据缺口或明显降级。",
      ...candidate.degradedFlags.slice(0, 2)
    ],
    triggerSummary
  };
};

const buildMetricCards = (
  candidates: Candidate[],
  coverage: SourceCoverageItem[]
): Array<{ label: string; value: string; tone: "neutral" | "bull" | "bear" | "warning"; hint: string }> => {
  const actionable = candidates.filter(
    (candidate) =>
      candidate.routerDecision === "trend_long_candidate" ||
      candidate.routerDecision === "short_candidate"
  ).length;
  const longs = candidates.filter((candidate) => candidate.routerDecision === "trend_long_candidate").length;
  const shorts = candidates.filter((candidate) => candidate.routerDecision === "short_candidate").length;
  const liveSources = coverage.filter((item) => item.runtimeMode === "live").length;
  const avgScore =
    candidates.length === 0
      ? 0
      : candidates.reduce((sum, candidate) => sum + candidate.scoreBreakdown.finalScore, 0) /
        candidates.length;

  return [
    {
      label: "可执行候选",
      value: actionable.toString(),
      tone: "neutral",
      hint: `${candidates.length} 个标的进入面板`
    },
    {
      label: "趋势多",
      value: longs.toString(),
      tone: "bull",
      hint: "Lana 路由"
    },
    {
      label: "衰竭空",
      value: shorts.toString(),
      tone: "bear",
      hint: "Skanda 路由"
    },
    {
      label: "实时覆盖率",
      value: compactRatio(coverage.length === 0 ? 0 : liveSources / coverage.length),
      tone: liveSources === coverage.length ? "neutral" : "warning",
      hint: `平均信号强度 ${compactRatio(avgScore)}`
    }
  ];
};

const groupEvidenceByFamily = (evidence: Evidence[]): Record<SourceFamily, Evidence[]> =>
  FAMILY_ORDER.reduce(
    (accumulator, family) => ({
      ...accumulator,
      [family]: evidence.filter((item) => item.sourceFamily === family)
    }),
    {} as Record<SourceFamily, Evidence[]>
  );

const groupEvidenceByCategory = (evidence: Evidence[]): Record<EvidenceCategory, Evidence[]> =>
  CATEGORY_ORDER.reduce(
    (accumulator, category) => ({
      ...accumulator,
      [category]: evidence.filter((item) => item.category === category)
    }),
    {} as Record<EvidenceCategory, Evidence[]>
  );

const sortCandidates = (candidates: Candidate[]): Candidate[] =>
  [...candidates].sort((left, right) => {
    const decisionDelta = DECISION_PRIORITY[left.routerDecision] - DECISION_PRIORITY[right.routerDecision];
    if (decisionDelta !== 0) {
      return decisionDelta;
    }

    const scoreDelta = right.scoreBreakdown.finalScore - left.scoreBreakdown.finalScore;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.symbol.localeCompare(right.symbol);
  });

const matchesDecisionFilter = (candidate: Candidate, filter: DecisionFilter): boolean => {
  if (filter === "all") {
    return true;
  }

  if (filter === "actionable") {
    return (
      candidate.routerDecision === "trend_long_candidate" ||
      candidate.routerDecision === "short_candidate"
    );
  }

  if (filter === "watch") {
    return (
      candidate.routerDecision === "watchlist" ||
      candidate.routerDecision === "range_distribution_watch" ||
      candidate.routerDecision === "observe" ||
      candidate.routerDecision === "observe_soft" ||
      candidate.routerDecision === "observe_cooloff_15m"
    );
  }

  return candidate.routerDecision === filter;
};

const ScoreMeter = ({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: number;
  tone?: "neutral" | "bull" | "bear" | "warning";
}) => (
  <div className="meter-row">
    <div className="meter-row-header">
      <span>{label}</span>
      <strong>{compactRatio(value)}</strong>
    </div>
    <div className={`meter ${tone}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  </div>
);

const RadialGauge = ({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: number;
  tone?: "neutral" | "bull" | "bear" | "warning";
}) => (
  <div className={`radial-card ${tone}`}>
    <div
      className="radial-ring"
      style={{ "--ratio": `${Math.max(0, Math.min(1, value))}` } as CSSProperties}
    >
      <div className="radial-core">
        <strong>{compactRatio(value)}</strong>
      </div>
    </div>
    <span>{label}</span>
  </div>
);

const FamilyPulse = ({ candidate }: { candidate: Candidate }) => {
  const totals = FAMILY_ORDER.map((family) => ({
    family,
    count: candidate.activeEvidence.filter((item) => item.sourceFamily === family).length
  }));
  const totalCount = totals.reduce((sum, item) => sum + item.count, 0) || 1;

  return (
    <div className="family-pulse">
      {totals.map((item) => (
        <span
          key={item.family}
          className={`family-segment ${item.family}`}
          style={{ width: `${(item.count / totalCount) * 100}%` }}
          title={`${familyLabels[item.family]} ${item.count}`}
        />
      ))}
    </div>
  );
};

const ReplaySparkline = ({
  snapshots
}: {
  snapshots: CandidateReplayResponse["historicalSnapshotReplay"];
}) => {
  const items = snapshots.slice(-18);
  if (items.length === 0) {
    return <div className="empty-inline">暂无结构快照</div>;
  }

  const bars = items.map((snapshot, index) => {
    const strength = Number(snapshot.payload.strength ?? snapshot.payload.confidence ?? 0.35);
    const direction = String(snapshot.payload.direction ?? "neutral");
    const height = Math.max(18, Math.min(100, Math.round(strength * 100)));
    return (
      <span
        key={`${snapshot.timestamp}-${index}`}
        className={`spark-bar ${direction}`}
        style={{ height: `${height}%` }}
        title={`${snapshot.payload.subsource ?? "snapshot"} ${formatTimestamp(snapshot.timestamp)}`}
      />
    );
  });

  return <div className="sparkline">{bars}</div>;
};

const MetricStrip = ({
  candidates,
  coverage,
  loading
}: {
  candidates: Candidate[];
  coverage: SourceCoverageItem[];
  loading: boolean;
}) => (
  <div className="metric-strip">
    {loading
      ? Array.from({ length: 4 }).map((_, index) => (
          <section key={`metric-loading-${index}`} className="metric-card skeleton-card">
            <div className="skeleton-line short" />
            <div className="skeleton-line value" />
            <div className="skeleton-line medium" />
          </section>
        ))
      : buildMetricCards(candidates, coverage).map((metric) => (
          <section key={metric.label} className={`metric-card ${metric.tone}`}>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
            <span>{metric.hint}</span>
          </section>
        ))}
  </div>
);

const SelectionDock = ({
  candidate,
  compact,
  drawerOpen,
  onToggleDrawer
}: {
  candidate?: Candidate;
  compact: boolean;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
}) => {
  if (!candidate) {
    return null;
  }

  const actionLabel =
    candidate.routerDecision === "trend_long_candidate"
      ? "下一步看偏多执行卡"
      : candidate.routerDecision === "short_candidate"
        ? "下一步看偏空执行卡"
        : "下一步看观察卡";

  return (
    <section className="selection-dock panel-card">
      <div>
        <p className="selection-dock-label">当前已锁定标的</p>
        <div className="candidate-symbol-line">
          <strong>{displaySymbol(candidate)}</strong>
          <span>{decisionLabels[candidate.routerDecision]}</span>
          <span>{confidenceLabels[candidate.confidenceBand]}</span>
        </div>
        <p className="selection-dock-copy">
          {actionLabel}。别再只看中间卡片，真正的执行步骤、禁开条件和复评节奏都在执行卡里。
        </p>
      </div>
      <div className="selection-dock-actions">
        {compact ? (
          <button className="primary-button" type="button" onClick={onToggleDrawer}>
            {drawerOpen ? "收起执行卡" : "打开执行卡"}
          </button>
        ) : (
          <span className="micro-tag ok">右侧执行卡已固定显示</span>
        )}
      </div>
    </section>
  );
};

const StatusBanner = ({
  loading,
  candidateError,
  sourceError,
  coverage
}: {
  loading: boolean;
  candidateError: string | null;
  sourceError: string | null;
  coverage: SourceCoverageItem[];
}) => {
  if (candidateError || sourceError) {
    return (
      <section className="status-banner danger">
        <strong>研究台数据链路异常</strong>
        <p>
          {candidateError ? `候选池：${candidateError}` : null}
          {candidateError && sourceError ? "；" : null}
          {sourceError ? `源矩阵：${sourceError}` : null}
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="status-banner loading">
        <strong>正在同步实时源与路由结果</strong>
        <p>页面已挂起，请等待候选、证据和右侧终端工作区完成第一轮取数。</p>
      </section>
    );
  }

  const live = coverage.filter((item) => item.runtimeMode === "live").length;
  const fallback = coverage.filter((item) => item.runtimeMode === "fixture").length;
  const degraded = coverage.filter((item) => item.status !== "healthy").length;

  if (fallback > 0 || degraded > 0) {
    return (
      <section className="status-banner warning">
        <strong>当前为混合模式运行</strong>
        <p>
          实时源 {live} 个，快照回退 {fallback} 个，降级源 {degraded} 个。
          OKX 链上信号优先走真实数据，Binance 当前不可达部分会自动回退快照。
        </p>
      </section>
    );
  }

  return (
    <section className="status-banner ok">
      <strong>当前源全部在线</strong>
      <p>所有活动源都在实时模式下工作，没有触发降级或快照回退。</p>
    </section>
  );
};

const SourceCoverageRail = ({
  items,
  loading,
  errorMessage
}: {
  items: SourceCoverageItem[];
  loading: boolean;
  errorMessage: string | null;
}) => {
  const groupedFamilies = useMemo(
    () =>
      FAMILY_ORDER.map((family) => ({
        family,
        items: items.filter((item) => item.family === family)
      })).filter((group) => group.items.length > 0),
    [items]
  );

  return (
    <section className="panel-card rail-card">
      <div className="section-header">
        <div>
          <h2>源矩阵</h2>
          <p>把安装状态、实时/回退模式、版本钉住和运行降级放在一处看清楚。</p>
        </div>
      </div>
      {errorMessage ? (
        <div className="inline-banner danger">{errorMessage}</div>
      ) : null}
      <div className="source-stack">
        {loading && items.length === 0
          ? Array.from({ length: 3 }).map((_, index) => (
              <div key={`source-loading-${index}`} className="source-family-card loading-card">
                <div className="skeleton-line short" />
                <div className="skeleton-line medium" />
                <div className="skeleton-line long" />
              </div>
            ))
          : null}
        {groupedFamilies.map((group) => (
          <div key={group.family} className="source-family-card">
            <div className="source-family-header">
              <span className={familyClassName(group.family)}>{familyLabels[group.family]}</span>
              <strong>{group.items.length}</strong>
            </div>
            <div className="source-list">
              {group.items.map((item) => (
                <article key={item.name} className="source-item">
                  <div className="source-item-main">
                    <div>
                      <h3>{item.name}</h3>
                      <p>
                        {runtimeModeLabels[item.runtimeMode]} · {installStateLabels[item.installState]}
                      </p>
                    </div>
                    <span className={sourceStatusClassName(item)}>
                      {sourceStatusLabels[item.status]}
                    </span>
                  </div>
                  <div className="source-meta">
                    <span>安装档位：{item.installProfile}</span>
                    <span>就绪校验：{item.readiness ? "已通过" : "未通过"}</span>
                    <span>版本钉住：{item.pinnedVersion}</span>
                    <span>更新时间：{formatTimestamp(item.lastUpdated)}</span>
                  </div>
                  {(item.rateLimited || item.retrying || item.errors.length > 0) && (
                    <div className="source-alerts">
                      {item.rateLimited ? <span className="mini-flag">限流</span> : null}
                      {item.retrying ? <span className="mini-flag">重试中</span> : null}
                      {item.backoffLevel > 0 ? (
                        <span className="mini-flag">退避 {item.backoffLevel}</span>
                      ) : null}
                      {item.errors.slice(0, 2).map((error) => (
                        <span key={error} className="mini-flag danger">
                          {formatSourceError(error)}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const FiltersRail = ({
  search,
  onSearchChange,
  decisionFilter,
  onDecisionFilterChange,
  regimeFilter,
  onRegimeFilterChange,
  confidenceFilter,
  onConfidenceFilterChange,
  candidateCount,
  visibleCount
}: {
  search: string;
  onSearchChange: (value: string) => void;
  decisionFilter: DecisionFilter;
  onDecisionFilterChange: (value: DecisionFilter) => void;
  regimeFilter: RegimeState | "all";
  onRegimeFilterChange: (value: RegimeState | "all") => void;
  confidenceFilter: ConfidenceBand | "all";
  onConfidenceFilterChange: (value: ConfidenceBand | "all") => void;
  candidateCount: number;
  visibleCount: number;
}) => (
  <section className="panel-card rail-card">
    <div className="section-header">
      <div>
        <h2>指挥轨道</h2>
        <p>先缩小观察范围，再决定是看多、看空，还是只保留在观察池。</p>
      </div>
      <span className="count-pill">
        {visibleCount}/{candidateCount}
      </span>
    </div>
    <div className="control-stack">
      <label className="field">
        <span>检索标的</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="例如：分析 ORDI / 做空 BAN / ASTEROID"
        />
      </label>
      <div className="chip-group">
        {(
          ["all", "actionable", "trend_long_candidate", "short_candidate", "watch"] as DecisionFilter[]
        ).map((option) => (
          <button
            key={option}
            className={`chip-button ${decisionFilter === option ? "active" : ""}`}
            onClick={() => onDecisionFilterChange(option)}
            type="button"
          >
            {option === "all"
              ? "全部"
              : option === "actionable"
                ? "可执行"
                : option === "watch"
                  ? "观察类"
                  : decisionLabels[option]}
          </button>
        ))}
      </div>
      <div className="field-grid">
        <label className="field">
          <span>环境状态</span>
          <select
            value={regimeFilter}
            onChange={(event) => onRegimeFilterChange(event.target.value as RegimeState | "all")}
          >
            <option value="all">全部</option>
            {Object.entries(regimeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>置信带</span>
          <select
            value={confidenceFilter}
            onChange={(event) =>
              onConfidenceFilterChange(event.target.value as ConfidenceBand | "all")
            }
          >
            <option value="all">全部</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </label>
      </div>
    </div>
  </section>
);

const CandidateBoard = ({
  candidates,
  selectedSymbol,
  onSelect,
  loading,
  errorMessage
}: {
  candidates: Candidate[];
  selectedSymbol?: string;
  onSelect: (symbol: string) => void;
  loading: boolean;
  errorMessage: string | null;
}) => (
  <section className="panel-card board-card">
    <div className="section-header">
      <div>
        <h2>信号面板</h2>
        <p>按路由优先级、最终分数和当前环境排序，先看谁值得花注意力。</p>
      </div>
      <div className="board-legend">
        <span className="legend-item bull">趋势跟随</span>
        <span className="legend-item bear">衰竭反向</span>
        <span className="legend-item neutral">观察 / 派发</span>
      </div>
    </div>
    <div className="candidate-list">
      {errorMessage ? (
        <div className="empty-state">
          候选池接口当前不可用。
          <br />
          {errorMessage}
        </div>
      ) : loading && candidates.length === 0 ? (
        Array.from({ length: 4 }).map((_, index) => (
          <article key={`candidate-loading-${index}`} className="candidate-row loading-card">
            <div className="candidate-row-top">
              <div className="loading-cluster">
                <div className="skeleton-line short" />
                <div className="skeleton-line medium" />
              </div>
              <div className="loading-cluster compact">
                <div className="skeleton-line short" />
              </div>
            </div>
            <div className="candidate-meters">
              <div className="skeleton-meter" />
              <div className="skeleton-meter" />
            </div>
            <div className="skeleton-bar" />
            <div className="candidate-row-bottom">
              <div className="loading-cluster">
                <div className="skeleton-line short" />
                <div className="skeleton-line medium" />
              </div>
            </div>
          </article>
        ))
      ) : candidates.length === 0 ? (
        <div className="empty-state">当前筛选条件下没有候选，调整左侧过滤器后会重新出现。</div>
      ) : (
        candidates.map((candidate) => {
          const discoveryCount = candidate.activeEvidence.filter(
            (item) => item.category === "discovery"
          ).length;
          const confirmationCount = candidate.activeEvidence.filter(
            (item) => item.category === "confirmation"
          ).length;
          const selected = selectedSymbol === candidate.symbol;

          return (
            <button
              key={candidate.symbol}
              type="button"
              className={`candidate-row ${selected ? "selected" : ""} ${candidate.routerDecision}`}
              onClick={() => {
                startTransition(() => onSelect(candidate.symbol));
              }}
            >
              <div className="candidate-row-top">
                <div>
                  <div className="candidate-symbol-line">
                    <strong>{displaySymbol(candidate)}</strong>
                    <span>{lifecycleLabels[candidate.lifecycleStage]}</span>
                    <span>{regimeLabels[candidate.regimeState]}</span>
                    {candidate.chain ? <span>{candidate.chain}</span> : null}
                  </div>
                  <div className="candidate-chip-line">
                    <span className={decisionClassName(candidate.routerDecision)}>
                      {decisionLabels[candidate.routerDecision]}
                    </span>
                    <span className={confidenceClassName(candidate.confidenceBand)}>
                      {confidenceLabels[candidate.confidenceBand]}
                    </span>
                    {displayCandidateId(candidate) ? (
                      <span className="signal-pill ghost">{displayCandidateId(candidate)}</span>
                    ) : null}
                  </div>
                </div>
                <div className="candidate-score-box">
                  <strong>{compactRatio(candidate.scoreBreakdown.finalScore)}</strong>
                  <span>最终分</span>
                </div>
              </div>
              <div className="candidate-meters">
                <ScoreMeter label="确认强度" value={candidate.scoreBreakdown.confirmationScore} tone="bull" />
                <ScoreMeter label="风险惩罚" value={candidate.scoreBreakdown.riskPenalty} tone="warning" />
              </div>
              <FamilyPulse candidate={candidate} />
              <div className="candidate-row-bottom">
                <div className="candidate-footprint">
                  <span>{discoveryCount} 个发现证据</span>
                  <span>{confirmationCount} 个确认证据</span>
                  <span>{candidate.resonance.familyCount} 个家族共振</span>
                </div>
                <div className="candidate-tags">
                  {candidate.decisionReason.slice(0, 3).map((reason) => (
                    <span key={reason} className="micro-tag">
                      {formatDecisionReason(reason)}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })
      )}
    </div>
  </section>
);

const EvidenceFamilySection = ({
  family,
  evidence
}: {
  family: SourceFamily;
  evidence: Evidence[];
}) => (
  <section className="family-panel">
    <div className="family-panel-header">
      <span className={familyClassName(family)}>{familyLabels[family]}</span>
      <strong>{evidence.length}</strong>
    </div>
    <div className="family-panel-body">
      {evidence.length === 0 ? (
        <div className="family-empty">当前标签页下没有活跃证据</div>
      ) : (
        evidence.map((item) => (
          <article key={item.id} className="evidence-card">
            <div className="evidence-card-top">
              <div>
                <h4>{item.subsource}</h4>
                <p>{item.source}</p>
              </div>
              <span className={freshnessClassName(item.freshnessState)}>
                {item.freshnessState === "fresh"
                  ? "新鲜"
                  : item.freshnessState === "degrading"
                    ? "衰减中"
                    : "过期"}
              </span>
            </div>
            <div className="candidate-chip-line compact">
              <span className={categoryClassName(item.category)}>
                {categoryLabels[item.category]}
              </span>
              <span className={`signal-pill direction ${item.direction}`}>
                {directionLabels[item.direction]}
              </span>
              {item.isPrimary ? <span className="signal-pill primary">主证据</span> : null}
            </div>
            <div className="evidence-metrics">
              <ScoreMeter label="强度" value={item.strength} tone="neutral" />
              <ScoreMeter label="置信" value={item.confidence} tone="neutral" />
              <ScoreMeter label="新鲜度" value={item.freshnessWeight} tone="neutral" />
            </div>
            <div className="evidence-footer">
              <span>{formatTimestamp(item.timestamp)}</span>
              <span>{item.crossFamilyThemeKey ?? "独立事件"}</span>
            </div>
          </article>
        ))
      )}
    </div>
  </section>
);

const ReviewHistory = ({ reviews }: { reviews: ManualReviewFeedback[] }) => (
  <div className="history-list">
    {reviews.length === 0 ? (
      <div className="empty-inline">还没有人工复核记录。</div>
    ) : (
      reviews.map((review) => (
        <article key={`${review.candidateId}-${review.reviewedAt}`} className="history-card">
          <div className="history-card-top">
            <strong>{reviewActionLabels[review.reviewerAction]}</strong>
            <span>{formatTimestamp(review.reviewedAt)}</span>
          </div>
          <div className="history-flags">
            <span className={`mini-flag ${review.thesisAccepted ? "ok" : "danger"}`}>
              论点 {review.thesisAccepted ? "通过" : "驳回"}
            </span>
            <span className={`mini-flag ${review.timingAccepted ? "ok" : "danger"}`}>
              时机 {review.timingAccepted ? "通过" : "驳回"}
            </span>
          </div>
          {review.reviewerNotes ? <p>{review.reviewerNotes}</p> : null}
        </article>
      ))
    )}
  </div>
);

const ReplayTimeline = ({
  items
}: {
  items: TimelineItem[];
}) => (
  <div className="timeline-list">
    {items.length === 0 ? (
      <div className="empty-inline">暂无可展示的时间线事件。</div>
    ) : (
      items.map((item) => (
        <article key={item.id} className={`timeline-card ${item.tone}`}>
          <div className="timeline-line" />
          <div className="timeline-dot" />
          <div className="timeline-body">
            <div className="timeline-head">
              <strong>{item.title}</strong>
              <span>{formatTimestamp(item.timestamp)}</span>
            </div>
            <p>{item.subtitle}</p>
            <span className="timeline-footnote">{item.footnote}</span>
          </div>
        </article>
      ))
    )}
  </div>
);

const AiAdvisorResult = ({ result }: { result: AiAdvisorResponse }) => (
  <div className="advisor-result">
    <div className="advisor-result-head">
      <div>
        <span className="subtle-label">分析来源</span>
        <strong>
          {result.provider === "ollama" ? "本地 Ollama" : "规则降级助手"} · {result.model}
        </strong>
      </div>
      <span className={`signal-pill ${result.safety.allowed ? "ok" : "danger"}`}>
        {result.safety.allowed ? "护栏通过" : "护栏拦截"}
      </span>
    </div>
    {result.safety.blockedReason ? (
      <div className="inline-banner warning">{result.safety.blockedReason}</div>
    ) : null}
    {result.safety.detectedRisks.length > 0 ? (
      <div className="micro-tag-list">
        {result.safety.detectedRisks.map((risk) => (
          <span key={risk} className="micro-tag warning">
            {risk}
          </span>
        ))}
      </div>
    ) : null}
    <p className="advisor-summary">{result.summary}</p>
    {result.retrievedContext.length > 0 ? (
      <div>
        <h3>检索增强上下文</h3>
        <div className="flag-stack">
          {result.retrievedContext.map((item) => (
            <span key={item} className="micro-tag ok">
              {item}
            </span>
          ))}
        </div>
      </div>
    ) : null}
    <div className="advisor-columns">
      <div>
        <h3>操作框架</h3>
        <ol className="execution-steps compact">
          {result.tradePlan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>
      <div>
        <h3>复核清单</h3>
        <div className="flag-stack">
          {result.checklist.map((item) => (
            <span key={item} className="micro-tag strong">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
    <div className="advisor-columns">
      <div>
        <h3>引用证据</h3>
        <div className="flag-stack">
          {result.evidenceUsed.map((item) => (
            <span key={item} className="micro-tag">
              {item}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3>失效条件</h3>
        <div className="flag-stack">
          {result.invalidationRules.map((item) => (
            <span key={item} className="micro-tag danger">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const buildTimelineItems = (
  candidate: Candidate,
  detail: CandidateDetailResponse,
  replay: CandidateReplayResponse
): TimelineItem[] => {
  const snapshotItems = replay.historicalSnapshotReplay.map((snapshot, index) => {
    const direction = String(snapshot.payload.direction ?? "neutral");
    const confidence = Number(snapshot.payload.confidence ?? 0);
    const strength = Number(snapshot.payload.strength ?? 0);
    const tone =
      direction === "bullish"
        ? "bull"
        : direction === "bearish"
          ? "bear"
          : "neutral";

    return {
      id: `snapshot-${index}-${snapshot.timestamp}`,
      timestamp: snapshot.timestamp,
      tone,
      title: String(snapshot.payload.subsource ?? "结构快照"),
      subtitle: `${directionLabels[direction as Evidence["direction"]] ?? "中性"} · 强度 ${compactRatio(strength)} · 置信 ${compactRatio(confidence)}`,
      footnote: String(snapshot.payload.crossFamilyThemeKey ?? candidate.routerDecision)
    } satisfies TimelineItem;
  });

  const reviewItems = detail.reviews.map<TimelineItem>((review, index) => ({
    id: `review-${index}-${review.reviewedAt}`,
    timestamp: review.reviewedAt,
    tone:
      review.reviewerAction === "short-bias"
        ? "bear"
        : review.reviewerAction === "long-bias"
          ? "bull"
          : "warning",
    title: `人工复核：${reviewActionLabels[review.reviewerAction]}`,
    subtitle: `${review.thesisAccepted ? "论点通过" : "论点驳回"} · ${review.timingAccepted ? "时机通过" : "时机驳回"}`,
    footnote: review.reviewerNotes || "无补充说明"
  }));

  return [...snapshotItems, ...reviewItems].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );
};

const DecisionWorkspace = ({
  symbol,
  compact = false,
  onClose
}: {
  symbol?: string;
  compact?: boolean;
  onClose?: () => void;
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DetailTab>("execution");
  const [reviewAction, setReviewAction] = useState<ManualReviewFeedback["reviewerAction"]>("watch");
  const [reviewNotes, setReviewNotes] = useState("");
  const [thesisAccepted, setThesisAccepted] = useState(true);
  const [timingAccepted, setTimingAccepted] = useState(false);
  const [advisorQuestion, setAdvisorQuestion] = useState("");

  const detailQuery = useQuery({
    queryKey: ["candidate-detail", symbol],
    queryFn: () => fetchCandidateDetail(symbol as string),
    enabled: Boolean(symbol)
  });

  const replayQuery = useQuery({
    queryKey: ["candidate-replay", symbol],
    queryFn: () => fetchCandidateReplay(symbol as string),
    enabled: Boolean(symbol)
  });

  const mutation = useMutation({
    mutationFn: postManualReview,
    onSuccess: async () => {
      setReviewNotes("");
      await queryClient.invalidateQueries({ queryKey: ["candidate-detail", symbol] });
      await queryClient.invalidateQueries({ queryKey: ["candidate-replay", symbol] });
      await queryClient.invalidateQueries({ queryKey: ["candidates"] });
    }
  });

  const advisorMutation = useMutation({
    mutationFn: postAiAnalysis
  });

  useEffect(() => {
    setActiveTab("execution");
    setAdvisorQuestion("");
    advisorMutation.reset();
  }, [symbol]);

  useEffect(() => {
    if (!symbol) {
      setReviewAction("watch");
      setReviewNotes("");
      setThesisAccepted(true);
      setTimingAccepted(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (reviewAction === "dismiss") {
      setThesisAccepted(false);
      setTimingAccepted(false);
      return;
    }

    if (reviewAction === "long-bias" || reviewAction === "short-bias") {
      setThesisAccepted(true);
      setTimingAccepted(true);
      return;
    }

    setThesisAccepted(true);
    setTimingAccepted(false);
  }, [reviewAction]);

  if (!symbol) {
    return (
      <section className="panel-card detail-shell">
        <div className="empty-state large">
          右侧详情区会在你选中候选后切到专业终端视图，包含 sticky 摘要、标签页、回放时间线和人工复核。
        </div>
      </section>
    );
  }

  if (detailQuery.isLoading || replayQuery.isLoading) {
    return (
      <section className="panel-card detail-shell">
        <div className="empty-state large">正在加载 {symbol} 的右侧终端工作区…</div>
      </section>
    );
  }

  const detail = detailQuery.data as CandidateDetailResponse | undefined;
  const replay = replayQuery.data as CandidateReplayResponse | undefined;

  if (!detail || !replay) {
    return (
      <section className="panel-card detail-shell">
        <div className="empty-state large">{symbol} 的详情暂时不可用。</div>
      </section>
    );
  }

  const candidate = detail.candidate;
  const groupedByFamily = groupEvidenceByFamily(candidate.activeEvidence);
  const groupedByCategory = groupEvidenceByCategory(candidate.activeEvidence);
  const timelineItems = buildTimelineItems(candidate, detail, replay);
  const executionGuide = buildExecutionGuide(candidate, detail.checklist);

  return (
    <section className="panel-card detail-shell">
      <div className="detail-sticky">
        <article className="detail-hero">
          <div className="detail-hero-top">
            <div>
              <div className="candidate-symbol-line hero">
                <strong>{displaySymbol(candidate)}</strong>
                <span>{lifecycleLabels[candidate.lifecycleStage]}</span>
                <span>{regimeLabels[candidate.regimeState]}</span>
                {candidate.chain ? <span>{candidate.chain}</span> : null}
              </div>
              <p className="hero-copy">
                {candidate.manualReviewRequired ? "需要人工复核" : "无需人工复核"} ·
                {" "}
                {candidate.contractAddresses?.[0]
                  ? `地址 ${shortAddress(candidate.contractAddresses[0])}`
                  : "未解析合约地址"}
              </p>
            </div>
            <div className="hero-score">
              {compact && onClose ? (
                <button className="detail-close-button" type="button" onClick={onClose}>
                  收起
                </button>
              ) : null}
              <span className={decisionClassName(candidate.routerDecision)}>
                {decisionLabels[candidate.routerDecision]}
              </span>
              <strong>{compactRatio(candidate.scoreBreakdown.finalScore)}</strong>
              <span className={confidenceClassName(candidate.confidenceBand)}>
                {confidenceLabels[candidate.confidenceBand]}
              </span>
            </div>
          </div>
          <div className="hero-tags">
            {candidate.decisionReason.slice(0, 4).map((reason) => (
              <span key={reason} className="micro-tag strong">
                {formatDecisionReason(reason)}
              </span>
            ))}
            {candidate.degradedFlags.slice(0, 4).map((flag) => (
              <span key={flag} className="micro-tag warning">
                {flag}
              </span>
            ))}
          </div>
        </article>

        <div className="detail-tabbar">
          {(Object.keys(tabLabels) as DetailTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`detail-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
      </div>

      <div className="detail-scroll">
        {activeTab === "execution" ? (
          <div className="detail-tab-body">
            <div className="detail-grid top">
              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>执行摘要</h2>
                    <p>先告诉你该不该做、往哪边做、多久复评一次，而不是让你自己脑补执行动作。</p>
                  </div>
                  <span className={decisionClassName(candidate.routerDecision)}>
                    {recommendedActionLabels[detail.checklist.recommendedAction]}
                  </span>
                </div>
                <div className="action-summary-grid">
                  <div className="action-summary-tile">
                    <span>当前偏向</span>
                    <strong>{executionGuide.headline}</strong>
                    <p>{executionGuide.bias}</p>
                  </div>
                  <div className="action-summary-tile">
                    <span>执行模式</span>
                    <strong>人工手动执行</strong>
                    <p>系统只给执行卡，不会自动替你下单。</p>
                  </div>
                  <div className="action-summary-tile">
                    <span>复评节奏</span>
                    <strong>{executionGuide.cadence}</strong>
                    <p>执行后按这个节奏回来看候选是否还成立。</p>
                  </div>
                </div>
                <div className="execution-hero-copy">{executionGuide.summary}</div>
              </article>

              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>手动执行步骤</h2>
                    <p>你要做的不是读懂系统，而是照着这几步决定：下不下、往哪边下、什么时候撤。</p>
                  </div>
                </div>
                <ol className="execution-steps">
                  {executionGuide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </article>
            </div>

            <div className="detail-grid bottom">
              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>为什么现在能看它</h2>
                    <p>把当前最关键的触发证据压成一组摘要，你不用再从几页证据里自己翻。</p>
                  </div>
                </div>
                <div className="micro-tag-list">
                  {executionGuide.triggerSummary.length === 0 ? (
                    <span className="empty-inline">当前没有足够清晰的触发摘要。</span>
                  ) : (
                    executionGuide.triggerSummary.map((item) => (
                      <span key={item} className="micro-tag strong">
                        {item}
                      </span>
                    ))
                  )}
                </div>
              </article>

              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>禁开条件</h2>
                    <p>这些情况出现时，不要因为页面亮绿/亮红就强行下单。</p>
                  </div>
                </div>
                <div className="flag-stack">
                  {executionGuide.noTrade.map((item) => (
                    <span key={item} className="micro-tag danger">
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            </div>
          </div>
        ) : null}

        {activeTab === "advisor" ? (
          <div className="detail-tab-body">
            <article className="panel-card inner-card advisor-card">
              <div className="section-header compact">
                <div>
                  <h2>AI 复核助手</h2>
                  <p>
                    优先调用本地 Ollama；未启用或不可达时自动降级为确定性策略助手。它只给人工复核框架，不会下单。
                  </p>
                </div>
                <span className="signal-pill ghost">manual only</span>
              </div>
              <div className="advisor-input-row">
                <label className="field">
                  <span>你要问的问题</span>
                  <textarea
                    rows={4}
                    value={advisorQuestion}
                    onChange={(event) => setAdvisorQuestion(event.target.value)}
                    placeholder={`例如：分析 ${displaySymbol(candidate)}，现在该观察、做多还是做空？`}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={advisorMutation.isPending}
                  type="button"
                  onClick={() =>
                    advisorMutation.mutate({
                      symbol: candidate.symbol,
                      question:
                        advisorQuestion.trim() ||
                        `分析 ${displaySymbol(candidate)}，给出人工复核和交易执行框架。`
                    })
                  }
                >
                  {advisorMutation.isPending ? "分析中…" : "生成 AI 分析"}
                </button>
              </div>
              {advisorMutation.error ? (
                <div className="inline-banner danger">{formatQueryError(advisorMutation.error)}</div>
              ) : null}
              {advisorMutation.data ? (
                <AiAdvisorResult result={advisorMutation.data} />
              ) : (
                <div className="advisor-empty">
                  <strong>建议问法</strong>
                  <p>
                    “分析 {displaySymbol(candidate)}，如果我是人工复核员，下一步应该看哪些结构、哪些条件失效、什么情况下不执行？”
                  </p>
                  <p>
                    课程演示时可说明：这里体现 Prompt Engineering、本地 Ollama 支持、安全护栏与 Agent 工具上下文融合。
                  </p>
                </div>
              )}
            </article>
          </div>
        ) : null}

        {activeTab === "overview" ? (
          <div className="detail-tab-body">
            <div className="detail-grid top">
              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>分数仪表</h2>
                    <p>把最终分、确认强度、风险惩罚和共振幅度拆开看，避免黑箱判断。</p>
                  </div>
                </div>
                <div className="radial-grid">
                  <RadialGauge label="最终分" value={candidate.scoreBreakdown.finalScore} tone="neutral" />
                  <RadialGauge label="确认强度" value={candidate.scoreBreakdown.confirmationScore} tone="bull" />
                  <RadialGauge label="风险惩罚" value={candidate.scoreBreakdown.riskPenalty} tone="warning" />
                  <RadialGauge
                    label="共振强度"
                    value={candidate.resonance.resonanceScore / 0.15}
                    tone="neutral"
                  />
                </div>
                <div className="meter-stack">
                  <ScoreMeter label="发现分" value={candidate.scoreBreakdown.discoveryScore} />
                  <ScoreMeter
                    label="确认分"
                    value={candidate.scoreBreakdown.confirmationScore}
                    tone="bull"
                  />
                  <ScoreMeter
                    label="佐证加分"
                    value={candidate.scoreBreakdown.corroborationBonus / 0.15}
                  />
                  <ScoreMeter
                    label="共振加分"
                    value={candidate.scoreBreakdown.resonanceBonus / 0.15}
                  />
                </div>
                <div className="stat-grid">
                  <div>
                    <span>环境乘数</span>
                    <strong>{candidate.scoreBreakdown.regimeMultiplier.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>生命周期乘数</span>
                    <strong>{candidate.scoreBreakdown.lifecycleMultiplier.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>否决状态</span>
                    <strong>{candidate.scoreBreakdown.vetoState}</strong>
                  </div>
                  <div>
                    <span>共振主题</span>
                    <strong>{candidate.resonance.dominantThemeKey ?? "无"}</strong>
                  </div>
                </div>
              </article>

              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>策略矩阵</h2>
                    <p>discovery 负责把标的拉进视野，confirmation 才决定能不能给方向。</p>
                  </div>
                </div>
                <div className="thesis-grid">
                  {CATEGORY_ORDER.map((category) => (
                    <div key={category} className={`thesis-tile ${category}`}>
                      <span>{categoryLabels[category]}</span>
                      <strong>{groupedByCategory[category].length}</strong>
                    </div>
                  ))}
                </div>
                <div className="resonance-card">
                  <div>
                    <span>家族共振</span>
                    <strong>{candidate.resonance.familyCount} 个家族对齐</strong>
                  </div>
                  <div className="resonance-stats">
                    <span>{candidate.resonance.alignedBullishFamilies} 个偏多</span>
                    <span>{candidate.resonance.alignedBearishFamilies} 个偏空</span>
                    <span>上限 {compactRatio(candidate.resonance.resonanceScore / 0.15)}</span>
                  </div>
                  <p>
                    当前信号来自 {candidate.sourceFamiliesSeen.map((family) => familyLabels[family]).join(" / ")}
                  </p>
                </div>
                <div className="flag-stack">
                  <div>
                    <span className="subtle-label">风险标签</span>
                    <div className="micro-tag-list">
                      {candidate.riskFlags.length === 0 ? (
                        <span className="empty-inline">暂无</span>
                      ) : (
                        candidate.riskFlags.map((flag) => (
                          <span key={flag} className="micro-tag warning">
                            {flag}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="subtle-label">失效条件</span>
                    <div className="micro-tag-list">
                      {candidate.invalidators.length === 0 ? (
                        <span className="empty-inline">暂无</span>
                      ) : (
                        candidate.invalidators.map((flag) => (
                          <span key={flag} className="micro-tag danger">
                            {flag}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <article className="panel-card inner-card">
              <div className="section-header compact">
                <div>
                  <h2>结构回放速览</h2>
                  <p>右侧先给你一条压缩回放带，真正往下钻再看完整时间线。</p>
                </div>
              </div>
              <div className="overview-replay">
                <ReplaySparkline snapshots={replay.historicalSnapshotReplay} />
                <div className="calibration-grid">
                  <div>
                    <span>总复核数</span>
                    <strong>{replay.calibrationReport.totalReviews}</strong>
                  </div>
                  <div>
                    <span>论点通过率</span>
                    <strong>{compactRatio(replay.calibrationReport.thesisAcceptanceRate)}</strong>
                  </div>
                  <div>
                    <span>时机通过率</span>
                    <strong>{compactRatio(replay.calibrationReport.timingAcceptanceRate)}</strong>
                  </div>
                  <div>
                    <span>建议动作</span>
                    <strong>{recommendedActionLabels[detail.checklist.recommendedAction]}</strong>
                  </div>
                </div>
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === "evidence" ? (
          <div className="detail-tab-body">
            <article className="panel-card inner-card">
              <div className="section-header compact">
                <div>
                  <h2>证据分家族展示</h2>
                  <p>不同家族分开看，能更容易分辨是结构在推动，还是只是一堆热度在叠加。</p>
                </div>
              </div>
              <div className="evidence-family-grid">
                {FAMILY_ORDER.map((family) => (
                  <EvidenceFamilySection
                    key={family}
                    family={family}
                    evidence={groupedByFamily[family]}
                  />
                ))}
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === "timeline" ? (
          <div className="detail-tab-body">
            <div className="detail-grid bottom">
              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>回放时间线</h2>
                    <p>按时间把结构快照和人工复核串起来，看清楚为什么进池、为什么没触发、又为什么被保留。</p>
                  </div>
                </div>
                <ReplayTimeline items={timelineItems} />
              </article>

              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>人工检查清单</h2>
                    <p>把论点、冲突、数据缺口和过期源全部摊开，方便你做最后判断。</p>
                  </div>
                </div>
                <div className="checklist-grid">
                  <div>
                    <span className="subtle-label">为什么进池</span>
                    <div className="micro-tag-list">
                      {detail.checklist.whyInPool.map((item) => (
                        <span key={item} className="micro-tag strong">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="subtle-label">偏多因素</span>
                    <div className="micro-tag-list">
                      {detail.checklist.bullishFactors.length === 0 ? (
                        <span className="empty-inline">暂无</span>
                      ) : (
                        detail.checklist.bullishFactors.map((item) => (
                          <span key={item} className="micro-tag ok">
                            {item}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="subtle-label">偏空因素</span>
                    <div className="micro-tag-list">
                      {detail.checklist.bearishFactors.length === 0 ? (
                        <span className="empty-inline">暂无</span>
                      ) : (
                        detail.checklist.bearishFactors.map((item) => (
                          <span key={item} className="micro-tag danger">
                            {item}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="subtle-label">风险与数据缺口</span>
                    <div className="micro-tag-list">
                      {[...detail.checklist.riskFactors, ...detail.checklist.dataGaps].length === 0 ? (
                        <span className="empty-inline">暂无</span>
                      ) : (
                        [...detail.checklist.riskFactors, ...detail.checklist.dataGaps].map((item) => (
                          <span key={item} className="micro-tag warning">
                            {item}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        ) : null}

        {activeTab === "review" ? (
          <div className="detail-tab-body">
            <div className="detail-grid bottom">
              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>人工复核录入</h2>
                    <p>反馈只落到回放和离线校准，不会回写当前路由，也不会在线自学习。</p>
                  </div>
                </div>
                <div className="control-stack">
                  <label className="field">
                    <span>复核动作</span>
                    <select
                      value={reviewAction}
                      onChange={(event) =>
                        setReviewAction(event.target.value as ManualReviewFeedback["reviewerAction"])
                      }
                    >
                      <option value="watch">继续观察</option>
                      <option value="dismiss">排除</option>
                      <option value="long-bias">偏多</option>
                      <option value="short-bias">偏空</option>
                    </select>
                  </label>
                  <div className="checkbox-row">
                    <label>
                      <input
                        checked={thesisAccepted}
                        onChange={(event) => setThesisAccepted(event.target.checked)}
                        type="checkbox"
                      />
                      论点通过
                    </label>
                    <label>
                      <input
                        checked={timingAccepted}
                        onChange={(event) => setTimingAccepted(event.target.checked)}
                        type="checkbox"
                      />
                      时机通过
                    </label>
                  </div>
                  <label className="field">
                    <span>复核备注</span>
                    <textarea
                      rows={6}
                      value={reviewNotes}
                      onChange={(event) => setReviewNotes(event.target.value)}
                      placeholder="记录论点、失效条件、仓位纪律和进场时机备注"
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        candidateId: candidate.symbol,
                        reviewedAt: new Date().toISOString(),
                        reviewerAction: reviewAction,
                        reviewerNotes: reviewNotes,
                        thesisAccepted,
                        timingAccepted
                      })
                    }
                    type="button"
                  >
                    {mutation.isPending ? "保存中…" : "保存复核"}
                  </button>
                </div>
              </article>

              <article className="panel-card inner-card">
                <div className="section-header compact">
                  <div>
                    <h2>复核历史</h2>
                    <p>同一标的的历史人工判断会留在这里，方便后续回放和阈值校准。</p>
                  </div>
                  <span className="count-pill">{detail.reviews.length} 条</span>
                </div>
                <ReviewHistory reviews={detail.reviews} />
              </article>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default function App() {
  const queryClient = useQueryClient();
  const pollingEnabled = import.meta.env.MODE !== "test";
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [regimeFilter, setRegimeFilter] = useState<RegimeState | "all">("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceBand | "all">("all");
  const [isCompactLayout, setIsCompactLayout] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 1520 : false
  );
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const deferredSearchTokens = useDeferredValue(parseSearchTokens(search));

  const sourceCoverageQuery = useQuery({
    queryKey: ["source-coverage"],
    queryFn: fetchSourceCoverage,
    refetchInterval: pollingEnabled ? 60_000 : false
  });

  const candidatesQuery = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
    refetchInterval: pollingEnabled ? 15_000 : false
  });

  const allCandidates = sortCandidates(candidatesQuery.data ?? []);
  const sourceCoverage = sourceCoverageQuery.data ?? [];
  const sourceCoverageError = sourceCoverageQuery.error
    ? formatQueryError(sourceCoverageQuery.error)
    : null;
  const candidatesError = candidatesQuery.error ? formatQueryError(candidatesQuery.error) : null;
  const isBootstrapping =
    (sourceCoverageQuery.isLoading || candidatesQuery.isLoading) &&
    allCandidates.length === 0 &&
    sourceCoverage.length === 0;
  const coverageSummary = useMemo(() => buildCoverageSummary(sourceCoverage), [sourceCoverage]);
  const selectedCandidate = useMemo(
    () => allCandidates.find((candidate) => candidate.symbol === selectedSymbol),
    [allCandidates, selectedSymbol]
  );

  const filteredCandidates = useMemo(
    () =>
      allCandidates.filter((candidate) => {
        const searchHaystack = `${candidate.symbol} ${candidate.baseAsset ?? ""}`.toUpperCase();
        if (
          deferredSearchTokens.length > 0 &&
          !deferredSearchTokens.every((token) => searchHaystack.includes(token))
        ) {
          return false;
        }

        if (!matchesDecisionFilter(candidate, decisionFilter)) {
          return false;
        }

        if (regimeFilter !== "all" && candidate.regimeState !== regimeFilter) {
          return false;
        }

        if (confidenceFilter !== "all" && candidate.confidenceBand !== confidenceFilter) {
          return false;
        }

        return true;
      }),
    [allCandidates, confidenceFilter, decisionFilter, deferredSearchTokens, regimeFilter]
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setIsCompactLayout(window.innerWidth <= 1520);
      return;
    }

    const media = window.matchMedia("(max-width: 1520px)");
    const sync = () => setIsCompactLayout(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (filteredCandidates.length === 0) {
      if (selectedSymbol) {
        startTransition(() => setSelectedSymbol(undefined));
      }
      return;
    }

    if (!selectedSymbol || !filteredCandidates.some((candidate) => candidate.symbol === selectedSymbol)) {
      startTransition(() => setSelectedSymbol(filteredCandidates[0].symbol));
    }
  }, [filteredCandidates, selectedSymbol]);

  useEffect(() => {
    if (!selectedSymbol) {
      setDetailDrawerOpen(false);
      return;
    }

    if (isCompactLayout) {
      setDetailDrawerOpen(true);
    }
  }, [isCompactLayout, selectedSymbol]);

  const handleRefresh = useEffectEvent(() => {
    void queryClient.invalidateQueries();
  });

  const decisionStreamUrl =
    `${import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ?? ""}/api/decision-stream`;

  useEffect(() => {
    const source = new EventSource(decisionStreamUrl);
    const listener = () => {
      handleRefresh();
    };

    source.addEventListener("refresh", listener);
    return () => {
      source.removeEventListener("refresh", listener);
      source.close();
    };
  }, [decisionStreamUrl, handleRefresh]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">研究终端 / v3</p>
          <h1>研究台 v3</h1>
          <p className="header-copy">
            左侧负责筛池，中间负责排优先级，右侧负责像交易终端一样给你完整交易论点。
            现在系统会优先吃真实的 OKX 链上数据，Binance 与交易所结构源则在本机不可达时自动回退快照。
          </p>
        </div>
        <div className="header-status">
          <span className="signal-pill primary">仅监控</span>
          <span className="signal-pill ghost">人工复核已启用</span>
          <span className="signal-pill ghost">自动下单关闭</span>
          <span className="signal-pill ghost">
            {coverageSummary.total > 0
              ? `实时源 ${coverageSummary.live}/${coverageSummary.total}`
              : "等待源矩阵"}
          </span>
          <span className="signal-pill ghost">
            {coverageSummary.latest ? `最近刷新 ${formatTimestamp(coverageSummary.latest)}` : "等待首轮同步"}
          </span>
        </div>
      </header>

      <StatusBanner
        loading={isBootstrapping}
        candidateError={candidatesError}
        sourceError={sourceCoverageError}
        coverage={sourceCoverage}
      />

      <MetricStrip candidates={allCandidates} coverage={sourceCoverage} loading={isBootstrapping} />

      <main className="workspace-grid">
        <aside className="workspace-rail">
          <FiltersRail
            search={search}
            onSearchChange={setSearch}
            decisionFilter={decisionFilter}
            onDecisionFilterChange={setDecisionFilter}
            regimeFilter={regimeFilter}
            onRegimeFilterChange={setRegimeFilter}
            confidenceFilter={confidenceFilter}
            onConfidenceFilterChange={setConfidenceFilter}
            candidateCount={allCandidates.length}
            visibleCount={filteredCandidates.length}
          />
          <SourceCoverageRail
            items={sourceCoverage}
            loading={sourceCoverageQuery.isLoading}
            errorMessage={sourceCoverageError}
          />
        </aside>

        <section className="workspace-board">
          <SelectionDock
            candidate={selectedCandidate}
            compact={isCompactLayout}
            drawerOpen={detailDrawerOpen}
            onToggleDrawer={() => setDetailDrawerOpen((value) => !value)}
          />
          <CandidateBoard
            candidates={filteredCandidates}
            selectedSymbol={selectedSymbol}
            onSelect={(symbol) => {
              setSelectedSymbol(symbol);
              if (isCompactLayout) {
                setDetailDrawerOpen(true);
              }
            }}
            loading={candidatesQuery.isLoading}
            errorMessage={candidatesError}
          />
        </section>

        {!isCompactLayout ? (
          <section className="workspace-detail">
            {isBootstrapping ? (
              <section className="panel-card detail-shell">
                <div className="empty-state large">
                  正在准备右侧终端工作区，待候选和回放数据同步完成后会自动切入 sticky + tabs 视图。
                </div>
              </section>
            ) : (
              <DecisionWorkspace symbol={selectedSymbol} />
            )}
          </section>
        ) : null}
      </main>

      {isCompactLayout ? (
        <>
          <button
            type="button"
            className={`detail-fab ${detailDrawerOpen ? "hidden" : ""}`}
            onClick={() => setDetailDrawerOpen(true)}
            disabled={!selectedSymbol}
          >
            {selectedSymbol ? `打开 ${selectedCandidate ? displaySymbol(selectedCandidate) : selectedSymbol} 执行卡` : "先选一个标的"}
          </button>
          {detailDrawerOpen ? (
            <button
              type="button"
              className="drawer-backdrop"
              aria-label="关闭执行卡"
              onClick={() => setDetailDrawerOpen(false)}
            />
          ) : null}
          <section className={`workspace-detail-drawer ${detailDrawerOpen ? "open" : ""}`}>
            {isBootstrapping ? (
              <section className="panel-card detail-shell">
                <div className="empty-state large">
                  正在准备执行卡，待候选和回放数据同步完成后会自动显示。
                </div>
              </section>
            ) : (
              <DecisionWorkspace
                symbol={selectedSymbol}
                compact
                onClose={() => setDetailDrawerOpen(false)}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
