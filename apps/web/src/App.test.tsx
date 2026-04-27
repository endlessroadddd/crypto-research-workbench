import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

const apiMocks = vi.hoisted(() => ({
  fetchBeginnerReports: vi.fn(),
  fetchSourceCoverage: vi.fn(),
  fetchCandidateDetail: vi.fn(),
  fetchRadarMovers: vi.fn()
}));

vi.mock("./api", () => ({
  fetchBeginnerReports: apiMocks.fetchBeginnerReports,
  fetchRadarMovers: apiMocks.fetchRadarMovers,
  fetchSourceCoverage: apiMocks.fetchSourceCoverage,
  fetchCandidates: vi.fn(async () => []),
  fetchCandidateDetail: apiMocks.fetchCandidateDetail,
  fetchCandidateReplay: vi.fn(async () => null),
  postAiAnalysis: vi.fn(async () => ({
    provider: "fallback",
    model: "test",
    generatedAt: new Date().toISOString(),
    safety: {
      allowed: true,
      manualOnly: true,
      detectedRisks: []
    },
    summary: "test",
    retrievedContext: [],
    tradePlan: [],
    checklist: [],
    evidenceUsed: [],
    invalidationRules: []
  })),
  postManualReview: vi.fn(async () => ({ ok: true }))
}));

const reportsPayload = {
  generatedAt: "2026-04-27T00:00:00.000Z",
  headline: "今日结论：暂不建议开单",
  overallRecommendation: "暂不建议开单",
  reason: "当前实时数据覆盖不足，系统没有发现明确高分候选。",
  advice: "今天先观望，不要为了交易而交易。",
  dataConfidence: "低",
  realtimeCoverage: 0,
  reports: []
};

const moversPayload = {
  generatedAt: "2026-04-27T10:00:00.000Z",
  source: "binance",
  marketType: "USDT-M Futures",
  status: "healthy",
  gainers: [
    {
      rank: 1,
      symbol: "PUMPUSDT",
      baseAsset: "PUMP",
      lastPrice: 0.012345,
      priceChangePercent: 18.456,
      quoteVolume: 26_480_000,
      quoteVolumeText: "$26.48M",
      sparkline: []
    }
  ],
  losers: [
    {
      rank: 1,
      symbol: "DUMPUSDT",
      baseAsset: "DUMP",
      lastPrice: 1.2345,
      priceChangePercent: -12.34,
      quoteVolume: 9_500_000,
      quoteVolumeText: "$9.50M",
      sparkline: []
    }
  ]
};

const renderApp = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      },
      mutations: {
        retry: false
      }
    }
  });

  const view = render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );

  return {
    client,
    view
  };
};

beforeEach(() => {
  apiMocks.fetchBeginnerReports.mockResolvedValue(reportsPayload);
  apiMocks.fetchRadarMovers.mockResolvedValue(moversPayload);
  apiMocks.fetchSourceCoverage.mockResolvedValue([]);
  apiMocks.fetchCandidateDetail.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("App", () => {
  it("renders movers board with gainers by default and switches to losers", async () => {
    const { client, view } = renderApp();

    expect(await screen.findByText("合约妖币异动雷达")).toBeTruthy();
    expect(screen.getByText("Binance 实时数据 · USDT 合约 · 过去 24 小时")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "涨幅榜" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "跌幅榜" })).toBeTruthy();
    expect(await screen.findByText("PUMP")).toBeTruthy();
    expect(screen.getByText("+18.46%")).toBeTruthy();
    expect(screen.queryByText("DUMP")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "跌幅榜" }));

    expect(await screen.findByText("DUMP")).toBeTruthy();
    expect(screen.getByText("-12.34%")).toBeTruthy();
    expect(screen.queryByText("PUMP")).toBeNull();

    client.clear();
    view.unmount();
  });

  it("shows request error state without blank screen", async () => {
    apiMocks.fetchRadarMovers.mockRejectedValueOnce(new Error("network down"));
    const { client, view } = renderApp();

    expect(await screen.findByText("数据暂时不可用，请稍后刷新。")).toBeTruthy();
    expect(screen.getByText("合约妖币异动雷达")).toBeTruthy();

    client.clear();
    view.unmount();
  });

  it("shows degraded source state before empty list", async () => {
    apiMocks.fetchRadarMovers.mockResolvedValueOnce({
      ...moversPayload,
      status: "degraded",
      error: {
        code: "BINANCE_UPSTREAM_ERROR",
        message: "Binance public market data is temporarily unavailable."
      },
      gainers: [],
      losers: []
    });
    const { client, view } = renderApp();

    expect(await screen.findByText("Binance 数据暂时不可用，请稍后刷新。")).toBeTruthy();
    expect(screen.queryByText("暂无异动币")).toBeNull();

    client.clear();
    view.unmount();
  });

  it("logs selected symbol when clicking a mover row", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { client, view } = renderApp();

    const asset = await screen.findByText("PUMP");
    const row = asset.closest("button");
    expect(row).toBeTruthy();
    fireEvent.click(row as HTMLButtonElement);

    await waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith("PUMPUSDT");
    });

    client.clear();
    view.unmount();
  });
});
