import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { Candidate, Evidence, ManualReviewFeedback } from "@research/core";
import { createStorageDatabase } from "@research/storage";
import { appendStructureEntries, dataDir, ensureStoragePaths, logsDir, snapshotsDir } from "@research/storage";
import { buildLiveEventReplay } from "./live-event-replay";
import { loadFixtureReplay } from "./fixture-replay";
import { buildHistoricalSnapshotReplay } from "./historical-snapshot-replay";

const cleanup = () => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(logsDir, { recursive: true, force: true });
  rmSync(snapshotsDir, { recursive: true, force: true });
};

afterEach(() => {
  cleanup();
});

const candidate = (): Candidate => ({
  symbol: "TEST",
  marketType: "both",
  lifecycleStage: "cex_liquid",
  regimeState: "trend_expansion",
  evidence: [],
  activeEvidence: [],
  historicalEvidence: [],
  sourceFamiliesSeen: ["market_structure"],
  resonance: {
    familyCount: 1,
    alignedBullishFamilies: 1,
    alignedBearishFamilies: 0,
    resonanceScore: 0,
    dominantThemeKey: undefined
  },
  scoreBreakdown: {
    discoveryScore: 0.4,
    confirmationScore: 0.8,
    riskPenalty: 0,
    corroborationBonus: 0.05,
    resonanceBonus: 0,
    regimeMultiplier: 1.15,
    lifecycleMultiplier: 1.12,
    vetoState: "none",
    finalScore: 0.82
  },
  riskFlags: [],
  degradedFlags: [],
  invalidators: [],
  routerEligibleModes: ["trend_long", "exhaustion_short"],
  routerDecision: "trend_long_candidate",
  confidenceBand: "high",
  manualReviewRequired: true,
  decisionReason: ["test"]
});

const feedback = (): ManualReviewFeedback => ({
  candidateId: "TEST",
  reviewedAt: "2026-04-17T12:10:00.000Z",
  reviewerAction: "watch",
  reviewerNotes: "keep watching",
  thesisAccepted: true,
  timingAccepted: false
});

const structureEvidence = (): Evidence => ({
  id: "structure-1",
  symbol: "TEST",
  source: "market-structure-feed",
  subsource: "price-action",
  sourceFamily: "market_structure",
  category: "confirmation",
  direction: "bullish",
  timestamp: "2026-04-17T12:00:00.000Z",
  ttlMs: 300000,
  degradingStartRatio: 0.8,
  freshnessState: "fresh",
  freshnessWeight: 1,
  strength: 0.9,
  confidence: 0.9,
  sameFamilyDedupeKey: "price-action",
  isPrimary: true
});

describe("replay", () => {
  it("builds live replay from persisted candidate and manual review", () => {
    cleanup();
    const db = createStorageDatabase();
    db.upsertCandidate(candidate());
    db.insertManualReview(feedback());

    const replay = buildLiveEventReplay(db, "TEST");
    expect(replay.symbol).toBe("TEST");
    expect(replay.candidate?.symbol).toBe("TEST");
    expect(replay.manualReviews).toHaveLength(1);

    db.close();
  });

  it("loads fixture replay snapshots", () => {
    cleanup();
    ensureStoragePaths();
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(
      `${snapshotsDir}/replay-fixture-test.json`,
      JSON.stringify({ ok: true, name: "fixture" }),
      "utf8"
    );

    expect(loadFixtureReplay<{ ok: boolean; name: string }>("replay-fixture-test")).toEqual({
      ok: true,
      name: "fixture"
    });
  });

  it("reads historical structure entries by symbol", () => {
    cleanup();
    appendStructureEntries([structureEvidence()]);

    const replay = buildHistoricalSnapshotReplay("TEST");
    expect(replay).toHaveLength(1);
    expect(replay[0]?.payload.sourceFamily).toBe("market_structure");
  });
});
