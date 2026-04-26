import { describe, expect, it } from "vitest";
import { evaluateCandidate } from "./evaluate";
import type { CandidateInput, Evidence, SourceCoverageItem } from "./types";

const coverage = (overrides?: Partial<SourceCoverageItem>): SourceCoverageItem => ({
  name: "market-structure-feed",
  family: "market_structure",
  installProfile: "active-only",
  installState: "installed_active",
  runtimeMode: "live",
  readiness: true,
  pinnedVersion: "test",
  pinnedSha: "test",
  status: "healthy",
  rateLimited: false,
  retrying: false,
  backoffLevel: 0,
  samplePayloadAvailable: true,
  errors: [],
  ...overrides
});

const evidence = (overrides: Partial<Evidence>): Evidence => ({
  id: crypto.randomUUID(),
  symbol: "TEST",
  source: "fixture",
  subsource: "fixture",
  sourceFamily: "social_sentiment",
  category: "discovery",
  direction: "bullish",
  timestamp: "2026-04-17T12:00:00.000Z",
  ttlMs: 1_000_000,
  degradingStartRatio: 0.8,
  freshnessState: "fresh",
  freshnessWeight: 1,
  strength: 0.8,
  confidence: 0.8,
  sameFamilyDedupeKey: "fixture",
  isPrimary: true,
  ...overrides
});

const input = (evidenceItems: Evidence[]): CandidateInput => ({
  symbol: "TEST",
  marketType: "both",
  evidence: evidenceItems
});

describe("router pipeline", () => {
  it("keeps strong discovery without structure confirmation at watchlist", () => {
    const candidate = evaluateCandidate(input([
      evidence({ sourceFamily: "social_sentiment" }),
      evidence({ sourceFamily: "rank_aggregator", sameFamilyDedupeKey: "rank" }),
      evidence({ sourceFamily: "onchain_flow", sameFamilyDedupeKey: "flow" })
    ]), {
      now: new Date("2026-04-17T12:05:00.000Z"),
      sourceCoverage: [coverage()]
    });

    expect(candidate.routerDecision).toBe("watchlist");
  });

  it("requires structure to unlock high-confidence long", () => {
    const candidate = evaluateCandidate(input([
      evidence({ sourceFamily: "social_sentiment" }),
      evidence({ sourceFamily: "rank_aggregator", sameFamilyDedupeKey: "rank" }),
      evidence({ sourceFamily: "market_structure", category: "confirmation", direction: "bullish", sameFamilyDedupeKey: "confirm" })
    ]), {
      now: new Date("2026-04-17T12:05:00.000Z"),
      sourceCoverage: [coverage()]
    });

    expect(candidate.routerDecision).toBe("trend_long_candidate");
  });

  it("routes blowoff exhaustion with bearish structure to short candidate", () => {
    const candidate = evaluateCandidate(input([
      evidence({ sourceFamily: "social_sentiment", direction: "bearish", strength: 0.9 }),
      evidence({ sourceFamily: "rank_aggregator", direction: "bearish", sameFamilyDedupeKey: "rank", strength: 0.9 }),
      evidence({ sourceFamily: "market_structure", category: "confirmation", direction: "bearish", source: "market", sameFamilyDedupeKey: "confirm", strength: 0.95, confidence: 0.9 })
    ]), {
      now: new Date("2026-04-17T12:05:00.000Z"),
      sourceCoverage: [coverage()]
    });

    expect(candidate.routerDecision).toBe("short_candidate");
  });

  it("degrades to data_degraded when core structure is stale or rate limited", () => {
    const candidate = evaluateCandidate(input([
      evidence({ sourceFamily: "market_structure", category: "confirmation", direction: "bullish" })
    ]), {
      now: new Date("2026-04-17T12:05:00.000Z"),
      sourceCoverage: [coverage({ status: "stale", rateLimited: true, backoffLevel: 3 })]
    });

    expect(candidate.regimeState).toBe("data_degraded");
    expect(candidate.routerDecision).not.toBe("trend_long_candidate");
  });

  it("does not hard-veto watchlist candidates just because structure fell back to degraded", () => {
    const candidate = evaluateCandidate(input([
      evidence({ sourceFamily: "social_sentiment", strength: 0.82 }),
      evidence({ sourceFamily: "onchain_flow", sameFamilyDedupeKey: "flow", strength: 0.8 })
    ]), {
      now: new Date("2026-04-17T12:05:00.000Z"),
      sourceCoverage: [coverage({ status: "degraded" })]
    });

    expect(candidate.routerDecision).not.toBe("veto");
  });
});
