import { describe, expect, it } from "vitest";
import { computeFreshness } from "./freshness";

describe("freshness", () => {
  it("transitions from fresh to degrading to stale", () => {
    const origin = new Date("2026-04-17T12:00:00.000Z");
    const ttlMs = 300_000;
    const degradingStartRatio = 0.8;

    const fresh = computeFreshness(origin.toISOString(), ttlMs, degradingStartRatio, new Date(origin.getTime() + 120_000));
    const degrading = computeFreshness(origin.toISOString(), ttlMs, degradingStartRatio, new Date(origin.getTime() + 270_000));
    const stale = computeFreshness(origin.toISOString(), ttlMs, degradingStartRatio, new Date(origin.getTime() + 310_000));

    expect(fresh.freshnessState).toBe("fresh");
    expect(fresh.freshnessWeight).toBe(1);
    expect(degrading.freshnessState).toBe("degrading");
    expect(degrading.freshnessWeight).toBeLessThan(1);
    expect(degrading.freshnessWeight).toBeGreaterThan(0);
    expect(stale.freshnessState).toBe("stale");
    expect(stale.freshnessWeight).toBe(0);
  });
});

