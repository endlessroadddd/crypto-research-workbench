import { afterEach, describe, expect, it, vi } from "vitest";
import type { MoverItem, MoversResponse } from "./movers.js";
import {
  buildOIAnomalyItem,
  buildOIReason,
  calculateDivergenceScore,
  calculateOIChangePercent,
  classifyOISeverity,
  getBinanceFuturesOIAnomalies,
  resetOIAnomaliesCacheForTest
} from "./oi-anomalies.js";

const mover = (overrides: Partial<MoverItem> = {}): MoverItem => ({
  rank: 1,
  symbol: "AAAUSDT",
  baseAsset: "AAA",
  lastPrice: 1.2,
  priceChangePercent: 2,
  quoteVolume: 26_480_000,
  quoteVolumeText: "$26.48M",
  sparkline: [],
  ...overrides
});

const moversResponse = (items: MoverItem[]): MoversResponse => ({
  generatedAt: "2026-04-27T00:00:00.000Z",
  source: "binance",
  marketType: "USDT-M Futures",
  status: "healthy",
  gainers: items,
  losers: []
});

afterEach(() => {
  resetOIAnomaliesCacheForTest();
  vi.restoreAllMocks();
});

describe("oi anomaly calculations", () => {
  it("calculates OI change percent and handles invalid previous values", () => {
    expect(calculateOIChangePercent(100, 125)).toBe(25);
    expect(calculateOIChangePercent(100, 75)).toBe(-25);
    expect(calculateOIChangePercent(0, 125)).toBe(0);
    expect(calculateOIChangePercent(Number.NaN, 125)).toBe(0);
  });

  it("calculates divergence score using minimum 0.5 denominator", () => {
    expect(calculateDivergenceScore(20, 2)).toBe(10);
    expect(calculateDivergenceScore(20, 0)).toBe(40);
    expect(calculateDivergenceScore(-10, -1)).toBe(10);
  });

  it("classifies severity", () => {
    expect(classifyOISeverity(25, 12)).toBe("extreme");
    expect(classifyOISeverity(12, 2)).toBe("high");
    expect(classifyOISeverity(4, 6)).toBe("high");
    expect(classifyOISeverity(4, 2)).toBe("normal");
  });

  it("builds reason text", () => {
    expect(buildOIReason("normal", false)).toBe("等待更多 OI 历史数据。");
    expect(buildOIReason("extreme", true)).toContain("OI 大幅变化");
    expect(buildOIReason("high", true)).toContain("OI 出现明显变化");
    expect(buildOIReason("normal", true)).toBe("OI 变化暂不极端。");
  });
});

describe("oi anomaly item builder", () => {
  it("sorts history by timestamp and prefers sumOpenInterestValue", () => {
    const item = buildOIAnomalyItem(mover({ priceChangePercent: 2 }), [
      {
        timestamp: 3000,
        sumOpenInterest: "300",
        sumOpenInterestValue: "1500"
      },
      {
        timestamp: 1000,
        sumOpenInterest: "100",
        sumOpenInterestValue: "1000"
      },
      {
        timestamp: 2000,
        sumOpenInterest: "200",
        sumOpenInterestValue: "1200"
      }
    ]);

    expect(item.openInterestPrev).toBe(1200);
    expect(item.openInterestNow).toBe(1500);
    expect(item.openInterestValuePrev).toBe(1200);
    expect(item.openInterestValueNow).toBe(1500);
    expect(item.openInterestChangePercent).toBe(25);
    expect(item.divergenceScore).toBe(12.5);
    expect(item.severity).toBe("extreme");
  });

  it("falls back to sumOpenInterest when value is invalid", () => {
    const item = buildOIAnomalyItem(mover({ priceChangePercent: 4 }), [
      {
        timestamp: 1000,
        sumOpenInterest: "100",
        sumOpenInterestValue: "bad"
      },
      {
        timestamp: 2000,
        sumOpenInterest: "115",
        sumOpenInterestValue: undefined
      }
    ]);

    expect(item.openInterestPrev).toBe(100);
    expect(item.openInterestNow).toBe(115);
    expect(item.openInterestValuePrev).toBeUndefined();
    expect(item.openInterestValueNow).toBeUndefined();
    expect(item.openInterestChangePercent).toBe(15);
    expect(item.severity).toBe("high");
  });

  it("keeps a data-insufficient item when history has less than two rows", () => {
    const item = buildOIAnomalyItem(mover(), [
      {
        timestamp: 1000,
        sumOpenInterest: "100",
        sumOpenInterestValue: "1000"
      }
    ]);

    expect(item.openInterestNow).toBe(1000);
    expect(item.openInterestPrev).toBeUndefined();
    expect(item.openInterestChangePercent).toBe(0);
    expect(item.divergenceScore).toBe(0);
    expect(item.severity).toBe("normal");
    expect(item.reason).toBe("等待更多 OI 历史数据。");
  });
});

describe("oi anomaly endpoint data flow", () => {
  it("skips one failed symbol and keeps successful items healthy", async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      expect(input).toContain("fapi.binance.com/futures/data/openInterestHist");
      expect(input).not.toContain("apiKey");
      expect(input).not.toContain("account");
      expect(input).not.toContain("order");
      expect(input).not.toContain("position");
      expect(input).not.toContain("leverage");

      if (input.includes("FAILUSDT")) {
        return {
          ok: false,
          status: 429,
          json: async () => ({})
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            timestamp: 1000,
            sumOpenInterestValue: "1000"
          },
          {
            timestamp: 2000,
            sumOpenInterestValue: "1300"
          }
        ]
      };
    });

    const payload = await getBinanceFuturesOIAnomalies({
      now: 1000,
      fetchImpl,
      moversProvider: async () =>
        moversResponse([
          mover({ symbol: "AAAUSDT", baseAsset: "AAA", priceChangePercent: 3 }),
          mover({ symbol: "FAILUSDT", baseAsset: "FAIL", priceChangePercent: 3 })
        ])
    });

    expect(payload.status).toBe("healthy");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].rank).toBe(1);
    expect(payload.items[0].symbol).toBe("AAAUSDT");
  });

  it("returns degraded when all OI requests fail", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 418,
      json: async () => ({})
    }));

    const payload = await getBinanceFuturesOIAnomalies({
      now: 1000,
      fetchImpl,
      moversProvider: async () => moversResponse([mover()])
    });

    expect(payload.status).toBe("degraded");
    expect(payload.items).toEqual([]);
  });

  it("returns degraded when movers are degraded", async () => {
    const payload = await getBinanceFuturesOIAnomalies({
      now: 1000,
      fetchImpl: vi.fn(),
      moversProvider: async () => ({
        generatedAt: "2026-04-27T00:00:00.000Z",
        source: "binance",
        marketType: "USDT-M Futures",
        status: "degraded",
        gainers: [],
        losers: []
      })
    });

    expect(payload.status).toBe("degraded");
    expect(payload.items).toEqual([]);
  });
});
