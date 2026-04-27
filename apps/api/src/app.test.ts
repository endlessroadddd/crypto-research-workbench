import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { resetMoversCacheForTest } from "./radar/movers.js";

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
});

afterEach(() => {
  resetMoversCacheForTest();
  vi.unstubAllGlobals();
});

describe("api app", () => {
  it("returns source coverage", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/source-coverage"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBeGreaterThan(0);
  });

  it("returns beginner reports", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/reports"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.headline).toContain("今日结论");
    expect(Array.isArray(payload.reports)).toBe(true);
    expect(payload.reports[0]).toHaveProperty("recommendation");
  });

  it("returns degraded radar movers when Binance upstream fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 418,
        json: async () => ({})
      }))
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/radar/movers"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.status).toBe("degraded");
    expect(payload.error.code).toBe("BINANCE_UPSTREAM_ERROR");
    expect(payload.gainers).toEqual([]);
    expect(payload.losers).toEqual([]);
  });

  it("returns guarded AI analysis for a candidate", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/analyze",
      payload: {
        symbol: "ORDI",
        question: "分析 ORDI，能不能直接下单？"
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.safety.manualOnly).toBe(true);
    expect(payload.provider).toBe("fallback");
    expect(payload.tradePlan.length).toBeGreaterThan(0);
  });
});
