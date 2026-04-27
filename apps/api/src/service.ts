import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildBeginnerReportSummary,
  buildBeginnerTradeReport,
  evaluateCandidate,
  type BeginnerReportSummary,
  type BeginnerTradeReport,
  type Candidate,
  type SourceCoverageItem
} from "@research/core";
import { loadAdapterRuntimes } from "@research/adapters";
import { buildCalibrationReport, buildManualReviewChecklist } from "@research/review";
import {
  appendStructureEntries,
  createStorageDatabase,
  snapshotsDir,
  type StorageDatabase,
  writeWindowSnapshot
} from "@research/storage";
import { candidateCatalog } from "./catalog.js";

export interface WorkspaceSnapshot {
  generatedAt: string;
  sourceCoverage: SourceCoverageItem[];
  candidates: Candidate[];
  reports: BeginnerTradeReport[];
  reportSummary: BeginnerReportSummary;
  reviewReport: ReturnType<typeof buildCalibrationReport>;
}

const snapshotFile = resolve(snapshotsDir, "current-candidates.json");
const calibrationFile = resolve(snapshotsDir, "review-calibration-report.json");

const groupEvidenceBySymbol = (evidence: ReturnType<typeof loadAdapterRuntimes>[number]["evidence"]) =>
  evidence.reduce<Record<string, typeof evidence>>((acc, item) => {
    const current = acc[item.symbol] ?? [];
    current.push(item);
    acc[item.symbol] = current;
    return acc;
  }, {});

const mergeCandidateMetadata = (
  runtimes: ReturnType<typeof loadAdapterRuntimes>
): Record<string, Omit<Parameters<typeof evaluateCandidate>[0], "evidence">> =>
  runtimes.reduce<Record<string, Omit<Parameters<typeof evaluateCandidate>[0], "evidence">>>(
    (accumulator, runtime) => {
      Object.entries(runtime.candidateMetadata).forEach(([symbol, metadata]) => {
        accumulator[symbol] = {
          ...(accumulator[symbol] ?? {
            symbol,
            marketType: "spot" as const
          }),
          ...metadata
        };
      });

      return accumulator;
    },
    {}
  );

export const recomputeWorkspace = (db: StorageDatabase): WorkspaceSnapshot => {
  const runtimes = loadAdapterRuntimes("active-only");
  const sourceCoverage = runtimes.map((runtime) => runtime.coverage);
  const allEvidence = runtimes.flatMap((runtime) => runtime.evidence);
  const evidenceBySymbol = groupEvidenceBySymbol(allEvidence);
  const metadataBySymbol = mergeCandidateMetadata(runtimes);

  const candidates = Object.entries(evidenceBySymbol)
    .map(([symbol, evidence]) =>
      evaluateCandidate(
        {
          ...(candidateCatalog[symbol] ?? metadataBySymbol[symbol] ?? {
            symbol,
            marketType: "spot" as const
          }),
          ...(metadataBySymbol[symbol] ?? {}),
          evidence
        },
        {
          now: new Date(),
          sourceCoverage
        }
      )
    )
    .sort((left, right) => right.scoreBreakdown.finalScore - left.scoreBreakdown.finalScore);

  db.upsertSourceCoverage(sourceCoverage);
  candidates.forEach((candidate) => {
    db.recordEvidence(candidate);
    db.upsertCandidate(candidate);
  });

  const structureEvidence = allEvidence.filter((item) => item.sourceFamily === "market_structure");
  appendStructureEntries(structureEvidence);
  writeWindowSnapshot(
    structureEvidence.map((item) => ({
      symbol: item.symbol,
      timestamp: item.timestamp,
      payload: item
    }))
  );

  const reviewReport = buildCalibrationReport(
    candidates.flatMap((candidate) => db.getManualReviews(candidate.symbol))
  );

  mkdirSync(dirname(snapshotFile), { recursive: true });
  mkdirSync(dirname(calibrationFile), { recursive: true });
  writeFileSync(snapshotFile, JSON.stringify(candidates, null, 2), "utf8");
  writeFileSync(calibrationFile, JSON.stringify(reviewReport, null, 2), "utf8");

  const generatedAt = new Date().toISOString();
  const reports = candidates.map((candidate) => buildBeginnerTradeReport(candidate, sourceCoverage));
  const reportSummary = buildBeginnerReportSummary(candidates, sourceCoverage, generatedAt);

  return {
    generatedAt,
    sourceCoverage,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      decisionReason: candidate.decisionReason,
      manualReviewRequired: true
    })),
    reports,
    reportSummary,
    reviewReport
  };
};

export const loadCandidateDetail = (db: StorageDatabase, symbol: string) => {
  const candidate = db.getCandidate(symbol);
  if (!candidate) {
    return null;
  }

  return {
    candidate,
    checklist: buildManualReviewChecklist(candidate),
    reviews: db.getManualReviews(symbol)
  };
};

export const createDb = (): StorageDatabase => createStorageDatabase();
