import type { Candidate, ManualReviewFeedback } from "@research/core";
import type { StorageDatabase } from "@research/storage";

export interface ReplayTimeline {
  symbol: string;
  candidate: Candidate | null;
  manualReviews: ManualReviewFeedback[];
}

export const buildLiveEventReplay = (
  db: StorageDatabase,
  symbol: string
): ReplayTimeline => ({
  symbol,
  candidate: db.getCandidate(symbol),
  manualReviews: db.getManualReviews(symbol)
});

