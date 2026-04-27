import { useQuery } from "@tanstack/react-query";
import { fetchOIAnomalies, type OIAnomalyItem } from "../../api";

const severityLabels: Record<OIAnomalyItem["severity"], string> = {
  normal: "普通",
  high: "明显异动",
  extreme: "极端异动"
};

const formatSignedPercent = (value: number): string => {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
};

const formatPrice = (value: number): string => {
  if (value >= 100) {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 2
    });
  }

  if (value >= 1) {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 4
    });
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 8
  });
};

const OIAnomalySkeleton = () => (
  <div className="oi-state-list" aria-label="正在加载 OI 异动">
    {Array.from({ length: 6 }).map((_, index) => (
      <div key={`oi-skeleton-${index}`} className="oi-row skeleton-row">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    ))}
  </div>
);

const OIAnomalyRows = ({
  items,
  onSelectSymbol
}: {
  items: OIAnomalyItem[];
  onSelectSymbol: (symbol: string) => void;
}) => {
  if (items.length === 0) {
    return <div className="oi-empty">暂无 OI 异动</div>;
  }

  return (
    <div className="oi-table" role="table" aria-label="OI 异动榜">
      <div className="oi-row oi-head" role="row">
        <span>排名</span>
        <span>代币</span>
        <span>OI 变化</span>
        <span>价格</span>
        <span>24h 成交额</span>
        <span>背离度</span>
        <span>强度</span>
        <span>原因</span>
      </div>
      {items.map((item) => (
        <button
          key={item.symbol}
          className="oi-row oi-item"
          type="button"
          role="row"
          onClick={() => onSelectSymbol(item.symbol)}
        >
          <span className="rank-cell">#{item.rank}</span>
          <span className="asset-cell">
            <strong>{item.baseAsset}</strong>
            <small>{item.symbol}</small>
          </span>
          <span className={`percent-cell ${item.openInterestChangePercent >= 0 ? "positive" : "negative"}`}>
            {formatSignedPercent(item.openInterestChangePercent)}
          </span>
          <span>{formatPrice(item.lastPrice)}</span>
          <span>{item.quoteVolumeText}</span>
          <span className="oi-divergence">{item.divergenceScore.toFixed(1)}</span>
          <span className={`oi-severity ${item.severity}`}>{severityLabels[item.severity]}</span>
          <span className="oi-reason">{item.reason}</span>
        </button>
      ))}
    </div>
  );
};

export const OIAnomalyBoard = ({
  onSelectSymbol
}: {
  onSelectSymbol: (symbol: string) => void;
}) => {
  const oiQuery = useQuery({
    queryKey: ["radar-oi-anomalies"],
    queryFn: fetchOIAnomalies,
    refetchInterval: import.meta.env.MODE === "test" ? false : 60_000
  });

  const data = oiQuery.data;
  const isDegraded = data?.status === "degraded";

  return (
    <section className="panel-card oi-board">
      <div className="oi-board-top">
        <div>
          <p className="eyebrow">Binance Open Interest · {data?.period ?? "15m"}</p>
          <div className="oi-title-row">
            <h2>OI 异动榜</h2>
            <span>OI 异动用于发现合约持仓变化，不等于开单建议。</span>
          </div>
          <p>跟踪候选 USDT 合约的持仓变化、背离度和异动强度，辅助发现合约资金变化。</p>
        </div>
        <div className="movers-meta">
          <span>更新时间</span>
          <strong>{data?.generatedAt ? new Date(data.generatedAt).toLocaleString("zh-CN") : "同步中"}</strong>
        </div>
      </div>

      {oiQuery.isLoading ? <OIAnomalySkeleton /> : null}
      {oiQuery.isError ? <div className="oi-alert danger">OI 数据暂时不可用，请稍后刷新。</div> : null}
      {!oiQuery.isLoading && !oiQuery.isError && isDegraded ? (
        <div className="oi-alert warning">Binance OI 数据暂时不可用，请稍后刷新。</div>
      ) : null}
      {!oiQuery.isLoading && !oiQuery.isError && !isDegraded ? (
        <OIAnomalyRows items={data?.items ?? []} onSelectSymbol={onSelectSymbol} />
      ) : null}
    </section>
  );
};
