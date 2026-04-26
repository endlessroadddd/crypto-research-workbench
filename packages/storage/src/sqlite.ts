import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type {
  Candidate,
  ManualReviewFeedback,
  SourceCoverageItem
} from "@research/core";
import { ensureStoragePaths, sqlitePath } from "./paths";

export interface StorageDatabase {
  db: DatabaseSync;
  upsertSourceCoverage(items: SourceCoverageItem[]): void;
  upsertCandidate(candidate: Candidate): void;
  recordEvidence(candidate: Candidate): void;
  insertManualReview(feedback: ManualReviewFeedback): void;
  getCandidates(): Candidate[];
  getCandidate(symbol: string): Candidate | null;
  getSourceCoverage(): SourceCoverageItem[];
  getManualReviews(symbol: string): ManualReviewFeedback[];
  getReadiness(): { source: string; readiness: number; errors: string[] }[];
  close(): void;
}

const parseJson = <T>(value: string): T => JSON.parse(value) as T;
type PayloadRow = { payload: string };
type ReadinessRow = { source: string; readiness: number; errors: string };
type ManualReviewRow = Omit<
  ManualReviewFeedback,
  "thesisAccepted" | "timingAccepted"
> & {
  thesisAccepted: number;
  timingAccepted: number;
};
const runInTransaction = (db: DatabaseSync, fn: () => void): void => {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

export const createStorageDatabase = (): StorageDatabase => {
  ensureStoragePaths();
  mkdirSync(sqlitePath.replace(/\/[^/]+$/, ""), { recursive: true });
  const db = new DatabaseSync(sqlitePath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS source_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      ran_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_status (
      name TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS readiness_checks (
      source TEXT PRIMARY KEY,
      readiness INTEGER NOT NULL,
      errors TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evidence_events (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS candidate_snapshots (
      symbol TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS router_decisions (
      symbol TEXT PRIMARY KEY,
      decision TEXT NOT NULL,
      confidence_band TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decision_reasons (
      symbol TEXT NOT NULL,
      reason TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS degraded_flags (
      symbol TEXT NOT NULL,
      flag TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS manual_review_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      reviewer_action TEXT NOT NULL,
      reviewer_notes TEXT,
      thesis_accepted INTEGER NOT NULL,
      timing_accepted INTEGER NOT NULL
    );
  `);

  const insertSourceStatus = db.prepare(`
    INSERT INTO source_status (name, payload, updated_at)
    VALUES (@name, @payload, @updatedAt)
    ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `);

  const insertReadiness = db.prepare(`
    INSERT INTO readiness_checks (source, readiness, errors, updated_at)
    VALUES (@source, @readiness, @errors, @updatedAt)
    ON CONFLICT(source) DO UPDATE SET readiness = excluded.readiness, errors = excluded.errors, updated_at = excluded.updated_at
  `);

  const insertEvidence = db.prepare(`
    INSERT INTO evidence_events (id, symbol, payload, updated_at)
    VALUES (@id, @symbol, @payload, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `);

  const insertSnapshot = db.prepare(`
    INSERT INTO candidate_snapshots (symbol, payload, updated_at)
    VALUES (@symbol, @payload, @updatedAt)
    ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `);

  const insertDecision = db.prepare(`
    INSERT INTO router_decisions (symbol, decision, confidence_band, payload, updated_at)
    VALUES (@symbol, @decision, @confidenceBand, @payload, @updatedAt)
    ON CONFLICT(symbol) DO UPDATE SET decision = excluded.decision, confidence_band = excluded.confidence_band, payload = excluded.payload, updated_at = excluded.updated_at
  `);

  const deleteDecisionReasons = db.prepare(`DELETE FROM decision_reasons WHERE symbol = ?`);
  const insertDecisionReason = db.prepare(`
    INSERT INTO decision_reasons (symbol, reason, updated_at)
    VALUES (?, ?, ?)
  `);

  const deleteDegradedFlags = db.prepare(`DELETE FROM degraded_flags WHERE symbol = ?`);
  const insertDegradedFlag = db.prepare(`
    INSERT INTO degraded_flags (symbol, flag, updated_at)
    VALUES (?, ?, ?)
  `);

  const insertManualReview = db.prepare(`
    INSERT INTO manual_review_feedback (candidate_id, reviewed_at, reviewer_action, reviewer_notes, thesis_accepted, timing_accepted)
    VALUES (@candidateId, @reviewedAt, @reviewerAction, @reviewerNotes, @thesisAccepted, @timingAccepted)
  `);

  return {
    db,
    upsertSourceCoverage(items) {
      const now = new Date().toISOString();
      runInTransaction(db, () => {
        items.forEach((entry) => {
          insertSourceStatus.run({
            name: entry.name,
            payload: JSON.stringify(entry),
            updatedAt: now
          });
          insertReadiness.run({
            source: entry.name,
            readiness: entry.readiness ? 1 : 0,
            errors: JSON.stringify(entry.errors),
            updatedAt: now
          });
        });
      });
    },
    upsertCandidate(candidate) {
      const now = new Date().toISOString();
      insertSnapshot.run({
        symbol: candidate.symbol,
        payload: JSON.stringify(candidate),
        updatedAt: now
      });
      insertDecision.run({
        symbol: candidate.symbol,
        decision: candidate.routerDecision,
        confidenceBand: candidate.confidenceBand,
        payload: JSON.stringify(candidate),
        updatedAt: now
      });
      deleteDecisionReasons.run(candidate.symbol);
      candidate.decisionReason.forEach((reason) =>
        insertDecisionReason.run(candidate.symbol, reason, now)
      );
      deleteDegradedFlags.run(candidate.symbol);
      candidate.degradedFlags.forEach((flag) =>
        insertDegradedFlag.run(candidate.symbol, flag, now)
      );
    },
    recordEvidence(candidate) {
      const now = new Date().toISOString();
      runInTransaction(db, () => {
        candidate.evidence.forEach((entry) => {
          insertEvidence.run({
            id: entry.id,
            symbol: entry.symbol,
            payload: JSON.stringify(entry),
            updatedAt: now
          });
        });
      });
    },
    insertManualReview(feedback) {
      insertManualReview.run({
        candidateId: feedback.candidateId,
        reviewedAt: feedback.reviewedAt,
        reviewerAction: feedback.reviewerAction,
        reviewerNotes: feedback.reviewerNotes ?? null,
        thesisAccepted: feedback.thesisAccepted ? 1 : 0,
        timingAccepted: feedback.timingAccepted ? 1 : 0
      });
    },
    getCandidates() {
      return db
        .prepare(`SELECT payload FROM candidate_snapshots ORDER BY symbol`)
        .all()
        .map((row: unknown) => parseJson<Candidate>((row as PayloadRow).payload));
    },
    getCandidate(symbol) {
      const row = db
        .prepare(`SELECT payload FROM candidate_snapshots WHERE symbol = ?`)
        .get(symbol) as { payload: string } | undefined;
      return row ? parseJson<Candidate>(row.payload) : null;
    },
    getSourceCoverage() {
      return db
        .prepare(`SELECT payload FROM source_status ORDER BY name`)
        .all()
        .map((row: unknown) =>
          parseJson<SourceCoverageItem>((row as PayloadRow).payload)
        );
    },
    getManualReviews(symbol) {
      return db
        .prepare(
          `SELECT candidate_id as candidateId, reviewed_at as reviewedAt, reviewer_action as reviewerAction, reviewer_notes as reviewerNotes, thesis_accepted as thesisAccepted, timing_accepted as timingAccepted
           FROM manual_review_feedback WHERE candidate_id = ? ORDER BY reviewed_at DESC`
        )
        .all(symbol)
        .map((row: unknown) => ({
          ...(row as ManualReviewRow),
          thesisAccepted: Boolean((row as ManualReviewRow).thesisAccepted),
          timingAccepted: Boolean((row as ManualReviewRow).timingAccepted)
        }));
    },
    getReadiness() {
      return db
        .prepare(`SELECT source, readiness, errors FROM readiness_checks ORDER BY source`)
        .all()
        .map((row: unknown) => ({
          source: (row as ReadinessRow).source,
          readiness: Number((row as ReadinessRow).readiness),
          errors: parseJson<string[]>((row as ReadinessRow).errors)
        }));
    },
    close() {
      db.close();
    }
  };
};
