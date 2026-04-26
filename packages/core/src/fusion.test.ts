import { describe, expect, it } from "vitest";
import type { Evidence } from "./types";
import { computeResonance, dedupeSameFamily } from "./fusion";

const evidence = (overrides: Partial<Evidence>): Evidence => ({
  id: crypto.randomUUID(),
  symbol: "TEST",
  source: "test",
  subsource: "fixture",
  sourceFamily: "social_sentiment",
  category: "discovery",
  direction: "bullish",
  timestamp: "2026-04-17T12:00:00.000Z",
  ttlMs: 1000,
  degradingStartRatio: 0.8,
  freshnessState: "fresh",
  freshnessWeight: 1,
  strength: 0.8,
  confidence: 0.8,
  sameFamilyDedupeKey: "key",
  isPrimary: true,
  ...overrides
});

describe("fusion", () => {
  it("dedupes same-family evidence and keeps strongest as primary", () => {
    const result = dedupeSameFamily([
      evidence({ source: "a", strength: 0.2 }),
      evidence({ source: "b", strength: 0.9 })
    ]);

    expect(result).toHaveLength(2);
    expect(result.filter((item) => item.isPrimary)).toHaveLength(1);
    expect(result.find((item) => item.isPrimary)?.source).toBe("b");
  });

  it("caps resonance bonus across families", () => {
    const result = computeResonance(
      [
        evidence({ sourceFamily: "social_sentiment" }),
        evidence({ sourceFamily: "rank_aggregator" }),
        evidence({ sourceFamily: "onchain_flow" }),
        evidence({ sourceFamily: "market_structure", category: "confirmation" })
      ],
      0.15
    );

    expect(result.familyCount).toBe(4);
    expect(result.resonanceScore).toBeLessThanOrEqual(0.15);
  });
});

