import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRadarMovers, type MoverItem } from "../../api";

type MoversTab = "gainers" | "losers";

const formatPercent = (value: number): string => {
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

const MoversSkeleton = () => (
  <div className="movers-state-list" aria-label="正在加载异动币">
    {Array.from({ length: 8 }).map((_, index) => (
      <div key={`mover-skeleton-${index}`} className="movers-row skeleton-row">
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

const MoversRows = ({
  items,
  tab,
  onSelectSymbol
}: {
  items: MoverItem[];
  tab: MoversTab;
  onSelectSymbol: (symbol: string) => void;
}) => {
  if (items.length === 0) {
    return <div className="movers-empty">暂无异动币</div>;
  }

  return (
    <div className="movers-table" role="table" aria-label={tab === "gainers" ? "涨幅榜" : "跌幅榜"}>
      <div className="movers-row movers-head" role="row">
        <span>排名</span>
        <span>代币</span>
        <span>24h 成交额</span>
        <span>趋势</span>
        <span>价格</span>
        <span>涨跌幅</span>
      </div>
      {items.map((item) => (
        <button
          key={`${tab}-${item.symbol}`}
          className="movers-row movers-item"
          type="button"
          role="row"
          onClick={() => onSelectSymbol(item.symbol)}
        >
          <span className="rank-cell">#{item.rank}</span>
          <span className="asset-cell">
            <strong>{item.baseAsset}</strong>
            <small>{item.symbol}</small>
          </span>
          <span>{item.quoteVolumeText}</span>
          <span className="sparkline-cell">{item.sparkline.length === 0 ? "—" : item.sparkline.join(" ")}</span>
          <span>{formatPrice(item.lastPrice)}</span>
          <span className={`percent-cell ${item.priceChangePercent >= 0 ? "positive" : "negative"}`}>
            {formatPercent(item.priceChangePercent)}
          </span>
        </button>
      ))}
    </div>
  );
};

export const MoversBoard = ({
  onSelectSymbol
}: {
  onSelectSymbol: (symbol: string) => void;
}) => {
  const [activeTab, setActiveTab] = useState<MoversTab>("gainers");
  const moversQuery = useQuery({
    queryKey: ["radar-movers"],
    queryFn: fetchRadarMovers,
    refetchInterval: import.meta.env.MODE === "test" ? false : 60_000
  });

  const data = moversQuery.data;
  const items = activeTab === "gainers" ? data?.gainers ?? [] : data?.losers ?? [];
  const isDegraded = data?.status === "degraded";

  return (
    <section className="panel-card movers-board">
      <div className="movers-board-top">
        <div>
          <p className="eyebrow">Binance USDT-M Futures</p>
          <h2>24h 异动币雷达</h2>
          <p>
            自动刷新涨幅榜和跌幅榜，只展示已上线 USDT 合约且成交额过滤后的标的。
          </p>
        </div>
        <div className="movers-meta">
          <span>更新时间</span>
          <strong>{data?.generatedAt ? new Date(data.generatedAt).toLocaleString("zh-CN") : "同步中"}</strong>
        </div>
      </div>

      <div className="movers-tabs" role="tablist" aria-label="涨跌幅榜切换">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "gainers"}
          className={activeTab === "gainers" ? "active" : ""}
          onClick={() => setActiveTab("gainers")}
        >
          涨幅榜
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "losers"}
          className={activeTab === "losers" ? "active" : ""}
          onClick={() => setActiveTab("losers")}
        >
          跌幅榜
        </button>
      </div>

      {moversQuery.isLoading ? <MoversSkeleton /> : null}
      {moversQuery.isError ? <div className="movers-alert danger">数据暂时不可用，请稍后刷新。</div> : null}
      {!moversQuery.isLoading && !moversQuery.isError && isDegraded ? (
        <div className="movers-alert warning">Binance 数据暂时不可用，请稍后刷新。</div>
      ) : null}
      {!moversQuery.isLoading && !moversQuery.isError && !isDegraded ? (
        <MoversRows items={items} tab={activeTab} onSelectSymbol={onSelectSymbol} />
      ) : null}
    </section>
  );
};
