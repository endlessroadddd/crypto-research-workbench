import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMoversResponse,
  formatQuoteVolumeText,
  getBinanceFuturesMovers,
  resetMoversCacheForTest
} from "./movers.js";

afterEach(() => {
  resetMoversCacheForTest();
  vi.restoreAllMocks();
});

describe("binance futures movers", () => {
  it("formats quote volume text", () => {
    expect(formatQuoteVolumeText(26_480_000)).toBe("$26.48M");
    expect(formatQuoteVolumeText(1_230_000_000)).toBe("$1.23B");
    expect(formatQuoteVolumeText(950_000)).toBe("$950.00K");
  });

  it("filters invalid rows and sorts gainers / losers", () => {
    const payload = buildMoversResponse([
      {
        symbol: "AAAUSDT",
        lastPrice: "1.2",
        priceChangePercent: "12.5",
        quoteVolume: "3000000"
      },
      {
        symbol: "BBBUSDT",
        lastPrice: "0.8",
        priceChangePercent: "-8.1",
        quoteVolume: "4000000"
      },
      {
        symbol: "CCCUSDT",
        lastPrice: "2",
        priceChangePercent: "20.25",
        quoteVolume: "26480000"
      },
      {
        symbol: "DDDUSDC",
        lastPrice: "1",
        priceChangePercent: "99",
        quoteVolume: "999999999"
      },
      {
        symbol: "LOWUSDT",
        lastPrice: "1",
        priceChangePercent: "55",
        quoteVolume: "999999"
      },
      {
        symbol: "BADUSDT",
        lastPrice: "bad",
        priceChangePercent: "1",
        quoteVolume: "2000000"
      }
    ]);

    expect(payload.status).toBe("healthy");
    expect(payload.gainers.map((item) => item.symbol)).toEqual(["CCCUSDT", "AAAUSDT", "BBBUSDT"]);
    expect(payload.losers.map((item) => item.symbol)).toEqual(["BBBUSDT", "AAAUSDT", "CCCUSDT"]);
    expect(payload.gainers[0]).toMatchObject({
      rank: 1,
      baseAsset: "CCC",
      lastPrice: 2,
      priceChangePercent: 20.25,
      quoteVolume: 26_480_000,
      quoteVolumeText: "$26.48M",
      sparkline: []
    });
  });

  it("returns degraded response when upstream fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({})
    }));

    const payload = await getBinanceFuturesMovers({
      now: 1_000,
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(payload.status).toBe("degraded");
    expect(payload.error?.code).toBe("BINANCE_UPSTREAM_ERROR");
    expect(payload.gainers).toEqual([]);
    expect(payload.losers).toEqual([]);
  });

  it("returns degraded response when upstream payload is not an array", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ message: "unexpected" })
    }));

    const payload = await getBinanceFuturesMovers({
      now: 1_000,
      fetchImpl
    });

    expect(payload.status).toBe("degraded");
    expect(payload.gainers).toEqual([]);
    expect(payload.losers).toEqual([]);
  });
});
