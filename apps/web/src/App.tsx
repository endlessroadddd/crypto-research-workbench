import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  BeginnerTradeReport,
  Candidate,
  Evidence,
  SourceCoverageItem
} from "@research/core";
import {
  fetchBeginnerReports,
  fetchCandidateDetail,
  fetchSourceCoverage,
  type CandidateDetailResponse
} from "./api";
import "./styles.css";

type RecommendationFilter = "all" | BeginnerTradeReport["recommendation"];

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
  "做多",
  "做空",
  "开单"
]);

const recommendationTone: Record<BeginnerTradeReport["recommendation"], string> = {
  可轻仓做多: "long",
  可轻仓做空: "short",
  观望: "watch",
  不建议参与: "avoid"
};

const directionLabel: Record<BeginnerTradeReport["direction"], string> = {
  long: "做多",
  short: "做空",
  neutral: "暂无方向"
};

const sourceStatusLabels: Record<SourceCoverageItem["status"], string> = {
  healthy: "健康",
  degraded: "降级",
  stale: "过期",
  unavailable: "不可用"
};

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

const formatQueryError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "请求失败，请检查 API 服务。";
};

const parseSearchTokens = (value: string): string[] =>
  value
    .replace(/[，。、“”‘’！？!?,./\\|()[\]{}:;]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !SEARCH_STOPWORDS.has(token.toLowerCase()))
    .map((token) => token.toUpperCase());

const scoreLabel = (score: number): string => {
  if (score >= 80) {
    return "强信号";
  }

  if (score >= 60) {
    return "中等信号";
  }

  if (score >= 40) {
    return "信号一般";
  }

  return "信号偏弱";
};

const sortReports = (reports: BeginnerTradeReport[]): BeginnerTradeReport[] => {
  const order: Record<BeginnerTradeReport["recommendation"], number> = {
    可轻仓做多: 0,
    可轻仓做空: 1,
    观望: 2,
    不建议参与: 3
  };

  return [...reports].sort((left, right) => {
    const decisionDelta = order[left.recommendation] - order[right.recommendation];
    if (decisionDelta !== 0) {
      return decisionDelta;
    }

    return right.advanced.finalScore - left.advanced.finalScore;
  });
};

const findCandidateByReport = (
  candidates: Candidate[] | undefined,
  report: BeginnerTradeReport | undefined
): Candidate | undefined =>
  report
    ? candidates?.find(
        (candidate) =>
          candidate.symbol.toUpperCase() === report.symbol.toUpperCase() ||
          candidate.baseAsset?.toUpperCase() === report.symbol.toUpperCase()
      )
    : undefined;

const StatusPill = ({
  children,
  tone
}: {
  children: React.ReactNode;
  tone: "long" | "short" | "watch" | "avoid" | "neutral" | "warning";
}) => <span className={`status-pill ${tone}`}>{children}</span>;

const TodayConclusion = ({
  headline,
  reason,
  advice,
  dataConfidence,
  realtimeCoverage,
  bestSymbol,
  loading,
  error
}: {
  headline?: string;
  reason?: string;
  advice?: string;
  dataConfidence?: string;
  realtimeCoverage?: number;
  bestSymbol?: string;
  loading: boolean;
  error: string | null;
}) => (
  <section className="hero-report">
    <div className="hero-copy-block">
      <p className="eyebrow">开单分析报告</p>
      <h1>{loading ? "正在生成今日结论…" : headline ?? "今日结论：暂无数据"}</h1>
      <p>{error ? `报告接口异常：${error}` : reason ?? "系统还没有拿到足够数据。"}</p>
      <div className="hero-actions">
        <StatusPill tone={dataConfidence === "低" ? "warning" : "neutral"}>
          数据可信度：{dataConfidence ?? "未知"}
        </StatusPill>
        <StatusPill tone="neutral">实时覆盖：{realtimeCoverage ?? 0}%</StatusPill>
        <StatusPill tone="neutral">重点关注：{bestSymbol ?? "暂无"}</StatusPill>
      </div>
    </div>
    <div className="hero-advice-card">
      <span>给新手的一句话</span>
      <strong>{advice ?? "先等系统同步完成，再判断是否值得开单。"}</strong>
      <p>本系统仅用于交易研究辅助，不构成投资建议。</p>
    </div>
  </section>
);

const ReportStats = ({ reports }: { reports: BeginnerTradeReport[] }) => {
  const longCount = reports.filter((report) => report.recommendation === "可轻仓做多").length;
  const shortCount = reports.filter((report) => report.recommendation === "可轻仓做空").length;
  const openCount = reports.filter((report) => report.canOpenPosition).length;
  const beginnerFriendly = reports.filter((report) => report.beginnerFriendly).length;

  return (
    <section className="quick-stats">
      <article>
        <span>能否开单</span>
        <strong>{openCount > 0 ? "需人工轻仓复核" : "暂不建议"}</strong>
        <p>{openCount} 个候选允许进入人工开单复核。</p>
      </article>
      <article>
        <span>做多机会</span>
        <strong>{longCount}</strong>
        <p>只统计明确轻仓做多建议。</p>
      </article>
      <article>
        <span>做空机会</span>
        <strong>{shortCount}</strong>
        <p>只统计明确轻仓做空建议。</p>
      </article>
      <article>
        <span>新手友好</span>
        <strong>{beginnerFriendly}</strong>
        <p>风险和置信度都通过基础过滤。</p>
      </article>
    </section>
  );
};

const ReportFilters = ({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  visibleCount,
  totalCount
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filter: RecommendationFilter;
  onFilterChange: (value: RecommendationFilter) => void;
  visibleCount: number;
  totalCount: number;
}) => (
  <section className="panel-card filter-card">
    <div>
      <h2>找一个币看报告</h2>
      <p>你可以直接输入“分析 ORDI”，系统会自动识别币种。</p>
    </div>
    <label className="search-field">
      <span>输入币种或问题</span>
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="例如：分析 ORDI / 看下 SOON / 今天能不能做空"
      />
    </label>
    <div className="chip-row">
      {(["all", "可轻仓做多", "可轻仓做空", "观望", "不建议参与"] as RecommendationFilter[]).map(
        (option) => (
          <button
            key={option}
            className={filter === option ? "active" : ""}
            type="button"
            onClick={() => onFilterChange(option)}
          >
            {option === "all" ? "全部建议" : option}
          </button>
        )
      )}
    </div>
    <p className="filter-count">
      当前显示 {visibleCount}/{totalCount} 个标的。
    </p>
  </section>
);

const ReportList = ({
  reports,
  selectedSymbol,
  onSelect,
  loading,
  error
}: {
  reports: BeginnerTradeReport[];
  selectedSymbol?: string;
  onSelect: (symbol: string) => void;
  loading: boolean;
  error: string | null;
}) => (
  <section className="panel-card report-list-card">
    <div className="section-heading">
      <div>
        <h2>币种建议列表</h2>
        <p>只看小白需要的结论：能不能开、方向、风险和一句话原因。</p>
      </div>
    </div>
    {error ? <div className="inline-alert danger">{error}</div> : null}
    <div className="report-list">
      {loading ? (
        Array.from({ length: 5 }).map((_, index) => (
          <article key={`loading-${index}`} className="report-row skeleton" />
        ))
      ) : reports.length === 0 ? (
        <div className="empty-state">当前没有匹配的报告。</div>
      ) : (
        reports.map((report) => {
          const selected = selectedSymbol === report.symbol;
          const tone = recommendationTone[report.recommendation];
          return (
            <button
              key={report.symbol}
              type="button"
              className={`report-row ${tone} ${selected ? "selected" : ""}`}
              onClick={() => startTransition(() => onSelect(report.symbol))}
            >
              <div className="report-main">
                <strong>{report.symbol}</strong>
                <StatusPill tone={tone as "long" | "short" | "watch" | "avoid"}>
                  {report.recommendation}
                </StatusPill>
                <span>{directionLabel[report.direction]}</span>
              </div>
              <p>{report.oneLineSummary}</p>
              <div className="report-meta">
                <span>置信度：{report.confidenceLevel}</span>
                <span>风险：{report.riskLevel}</span>
                <span>{scoreLabel(report.advanced.finalScore)}</span>
                <span>{report.beginnerFriendly ? "新手可复核" : "新手慎入"}</span>
              </div>
            </button>
          );
        })
      )}
    </div>
  </section>
);

const TextList = ({ items }: { items: string[] }) => (
  <ul className="text-list">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

const ReportDetail = ({
  report,
  candidate,
  detail,
  coverage,
  advancedOpen,
  onToggleAdvanced
}: {
  report?: BeginnerTradeReport;
  candidate?: Candidate;
  detail?: CandidateDetailResponse;
  coverage: SourceCoverageItem[];
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
}) => {
  if (!report) {
    return (
      <section className="panel-card detail-card">
        <div className="empty-state">先从左侧选择一个币，右侧会生成开单分析报告。</div>
      </section>
    );
  }

  const tone = recommendationTone[report.recommendation];

  return (
    <section className="panel-card detail-card">
      <div className="detail-header">
        <div>
          <p className="eyebrow">单币分析报告</p>
          <h2>
            {report.symbol} 当前建议：{report.recommendation}
          </h2>
          <p>{report.oneLineSummary}</p>
        </div>
        <div className="detail-verdict">
          <StatusPill tone={tone as "long" | "short" | "watch" | "avoid"}>
            {report.recommendation}
          </StatusPill>
          <strong>{report.canOpenPosition ? "可进入人工复核" : "不要直接开单"}</strong>
        </div>
      </div>

      <div className="verdict-grid">
        <article>
          <span>方向</span>
          <strong>{directionLabel[report.direction]}</strong>
        </article>
        <article>
          <span>置信度</span>
          <strong>{report.confidenceLevel}</strong>
        </article>
        <article>
          <span>风险等级</span>
          <strong>{report.riskLevel}</strong>
        </article>
        <article>
          <span>新手适合吗</span>
          <strong>{report.beginnerFriendly ? "可以复核" : "不适合贸然参与"}</strong>
        </article>
      </div>

      <div className="analysis-grid">
        <article className="analysis-block">
          <h3>为什么这么判断</h3>
          <TextList items={report.reasons} />
        </article>
        <article className="analysis-block">
          <h3>看多理由</h3>
          <TextList items={report.bullishReasons} />
        </article>
        <article className="analysis-block">
          <h3>看空 / 风险理由</h3>
          <TextList items={report.bearishReasons} />
        </article>
        <article className="analysis-block warning">
          <h3>风险提醒</h3>
          <TextList items={report.riskWarnings} />
        </article>
      </div>

      <div className="beginner-advice">
        <span>新手建议</span>
        <strong>{report.beginnerAdvice}</strong>
      </div>

      <div className="final-verdict">
        <h3>最终结论</h3>
        <p>{report.finalVerdict}</p>
      </div>

      <button className="advanced-toggle" type="button" onClick={onToggleAdvanced}>
        {advancedOpen ? "收起高级数据" : "查看高级数据"}
      </button>

      {advancedOpen ? (
        <AdvancedPanel
          report={report}
          candidate={candidate}
          detail={detail}
          coverage={coverage}
        />
      ) : null}
    </section>
  );
};

const AdvancedPanel = ({
  report,
  candidate,
  detail,
  coverage
}: {
  report: BeginnerTradeReport;
  candidate?: Candidate;
  detail?: CandidateDetailResponse;
  coverage: SourceCoverageItem[];
}) => {
  const evidence = candidate?.activeEvidence ?? [];

  return (
    <section className="advanced-panel">
      <div className="advanced-grid">
        <article>
          <h3>高级评分</h3>
          <dl>
            <div>
              <dt>finalScore</dt>
              <dd>{report.advanced.finalScore}</dd>
            </div>
            <div>
              <dt>route</dt>
              <dd>{report.advanced.route}</dd>
            </div>
            <div>
              <dt>regime</dt>
              <dd>{report.advanced.regime}</dd>
            </div>
            <div>
              <dt>lifecycle</dt>
              <dd>{report.advanced.lifecycle}</dd>
            </div>
            <div>
              <dt>evidenceCount</dt>
              <dd>{report.advanced.evidenceCount}</dd>
            </div>
          </dl>
        </article>
        <article>
          <h3>数据源覆盖</h3>
          <div className="source-mini-list">
            {coverage.map((source) => (
              <span key={source.name}>
                {source.name}：{sourceStatusLabels[source.status]} / {source.runtimeMode}
              </span>
            ))}
          </div>
        </article>
      </div>

      <article>
        <h3>原始证据摘要</h3>
        {evidence.length === 0 ? (
          <div className="empty-state small">暂无可展示的原始证据。</div>
        ) : (
          <div className="evidence-table">
            {evidence.slice(0, 12).map((item: Evidence) => (
              <div key={item.id}>
                <strong>{item.source}</strong>
                <span>{item.category}</span>
                <span>{item.direction}</span>
                <span>{item.subsource}</span>
              </div>
            ))}
          </div>
        )}
      </article>

      {detail ? (
        <article>
          <h3>人工复核清单</h3>
          <div className="source-mini-list">
            {[
              ...detail.checklist.whyInPool,
              ...detail.checklist.riskFactors,
              ...detail.checklist.dataGaps
            ]
              .slice(0, 10)
              .map((item) => (
                <span key={item}>{item}</span>
              ))}
          </div>
        </article>
      ) : null}
    </section>
  );
};

export default function App() {
  const pollingEnabled = import.meta.env.MODE !== "test";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RecommendationFilter>("all");
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const deferredSearchTokens = useDeferredValue(parseSearchTokens(search));

  const reportsQuery = useQuery({
    queryKey: ["beginner-reports"],
    queryFn: fetchBeginnerReports,
    refetchInterval: pollingEnabled ? 30_000 : false
  });

  const sourceCoverageQuery = useQuery({
    queryKey: ["source-coverage"],
    queryFn: fetchSourceCoverage,
    refetchInterval: pollingEnabled ? 60_000 : false
  });

  const reports = sortReports(reportsQuery.data?.reports ?? []);
  const sourceCoverage = sourceCoverageQuery.data ?? [];
  const reportError = reportsQuery.error ? formatQueryError(reportsQuery.error) : null;
  const sourceError = sourceCoverageQuery.error ? formatQueryError(sourceCoverageQuery.error) : null;

  const filteredReports = useMemo(
    () =>
      reports.filter((report) => {
        if (filter !== "all" && report.recommendation !== filter) {
          return false;
        }

        if (
          deferredSearchTokens.length > 0 &&
          !deferredSearchTokens.every((token) => report.symbol.toUpperCase().includes(token))
        ) {
          return false;
        }

        return true;
      }),
    [deferredSearchTokens, filter, reports]
  );

  useEffect(() => {
    if (filteredReports.length === 0) {
      setSelectedSymbol(undefined);
      return;
    }

    if (!selectedSymbol || !filteredReports.some((report) => report.symbol === selectedSymbol)) {
      setSelectedSymbol(filteredReports[0].symbol);
    }
  }, [filteredReports, selectedSymbol]);

  useEffect(() => {
    setAdvancedOpen(false);
  }, [selectedSymbol]);

  const selectedReport = filteredReports.find((report) => report.symbol === selectedSymbol);

  const detailQuery = useQuery({
    queryKey: ["candidate-detail", selectedSymbol],
    queryFn: () => fetchCandidateDetail(selectedSymbol as string),
    enabled: Boolean(selectedSymbol && advancedOpen)
  });

  const selectedCandidate = findCandidateByReport(
    detailQuery.data ? [detailQuery.data.candidate] : undefined,
    selectedReport
  );

  return (
    <div className="app-shell">
      <TodayConclusion
        headline={reportsQuery.data?.headline}
        reason={reportsQuery.data?.reason}
        advice={reportsQuery.data?.advice}
        dataConfidence={reportsQuery.data?.dataConfidence}
        realtimeCoverage={reportsQuery.data?.realtimeCoverage}
        bestSymbol={reportsQuery.data?.bestSymbol}
        loading={reportsQuery.isLoading}
        error={reportError}
      />

      <ReportStats reports={reports} />

      <main className="report-layout">
        <aside className="left-column">
          <ReportFilters
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
            visibleCount={filteredReports.length}
            totalCount={reports.length}
          />
          <section className="panel-card source-card">
            <h2>当前数据可信度</h2>
            {sourceError ? <div className="inline-alert danger">{sourceError}</div> : null}
            <p>
              实时覆盖 {reportsQuery.data?.realtimeCoverage ?? 0}%。
              数据不足时，系统会强制给出保守结论，不建议新手开单。
            </p>
            <div className="source-mini-list">
              {sourceCoverage.slice(0, 8).map((source) => (
                <span key={source.name}>
                  {source.name}：{sourceStatusLabels[source.status]}
                </span>
              ))}
            </div>
          </section>
        </aside>

        <section className="middle-column">
          <ReportList
            reports={filteredReports}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
            loading={reportsQuery.isLoading}
            error={reportError}
          />
        </section>

        <section className="right-column">
          <ReportDetail
            report={selectedReport}
            candidate={selectedCandidate}
            detail={detailQuery.data}
            coverage={sourceCoverage}
            advancedOpen={advancedOpen}
            onToggleAdvanced={() => setAdvancedOpen((value) => !value)}
          />
        </section>
      </main>
    </div>
  );
}
