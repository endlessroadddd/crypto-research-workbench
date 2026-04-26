import type { ManualReviewFeedback } from "@research/core";

export interface CalibrationReport {
  totalReviews: number;
  thesisAcceptanceRate: number;
  timingAcceptanceRate: number;
  actionBreakdown: Record<ManualReviewFeedback["reviewerAction"], number>;
}

export const buildCalibrationReport = (
  feedback: ManualReviewFeedback[]
): CalibrationReport => {
  const totalReviews = feedback.length;
  const thesisAccepted = feedback.filter((item) => item.thesisAccepted).length;
  const timingAccepted = feedback.filter((item) => item.timingAccepted).length;

  return {
    totalReviews,
    thesisAcceptanceRate: totalReviews === 0 ? 0 : thesisAccepted / totalReviews,
    timingAcceptanceRate: totalReviews === 0 ? 0 : timingAccepted / totalReviews,
    actionBreakdown: {
      dismiss: feedback.filter((item) => item.reviewerAction === "dismiss").length,
      watch: feedback.filter((item) => item.reviewerAction === "watch").length,
      "long-bias": feedback.filter((item) => item.reviewerAction === "long-bias").length,
      "short-bias": feedback.filter((item) => item.reviewerAction === "short-bias").length
    }
  };
};

