import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { Candidate, ManualReviewFeedback, SourceCoverageItem } from "@research/core";
import { createStorageDatabase } from "./sqlite";
import { dataDir, logsDir, snapshotsDir } from "./paths";

const cleanup = () => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(logsDir, { recursive: true, force: true });
  rmSync(snapshotsDir, { recursive: true, force: true });
};

afterEach(() => {
  cleanup();
});

const sampleCoverage = (): SourceCoverageItem => ({
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
  errors: []
});

const sampleCandidate = (): Candidate => ({
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

const sampleFeedback = (): ManualReviewFeedback => ({
  candidateId: "TEST",
  reviewedAt: "2026-04-17T12:10:00.000Z",
  reviewerAction: "long-bias",
  reviewerNotes: "looks good",
  thesisAccepted: true,
  timingAccepted: true
});

describe("storage database", () => {
  it("persists source coverage, candidates, readiness and manual review feedback", () => {
    cleanup();
    const db = createStorageDatabase();

    db.upsertSourceCoverage([sampleCoverage()]);
    db.upsertCandidate(sampleCandidate());
    db.insertManualReview(sampleFeedback());

    expect(db.getSourceCoverage()).toHaveLength(1);
    expect(db.getReadiness()).toEqual([
      {
        source: "market-structure-feed",
        readiness: 1,
        errors: []
      }
    ]);
    expect(db.getCandidate("TEST")?.routerDecision).toBe("trend_long_candidate");
    expect(db.getCandidates()).toHaveLength(1);
    expect(db.getManualReviews("TEST")).toHaveLength(1);

    db.close();
  });
});
