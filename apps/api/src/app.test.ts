import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
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
