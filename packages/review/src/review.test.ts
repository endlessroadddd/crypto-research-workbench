import { describe, expect, it } from "vitest";
import { buildCalibrationReport } from "./analytics";

describe("review analytics", () => {
  it("builds an offline calibration report", () => {
    const report = buildCalibrationReport([
      {
        candidateId: "ORDI",
        reviewedAt: "2026-04-17T12:00:00.000Z",
        reviewerAction: "watch",
        thesisAccepted: true,
        timingAccepted: false
      },
      {
        candidateId: "BAN",
        reviewedAt: "2026-04-17T12:02:00.000Z",
        reviewerAction: "short-bias",
        thesisAccepted: true,
        timingAccepted: true
      }
    ]);

    expect(report.totalReviews).toBe(2);
    expect(report.actionBreakdown["short-bias"]).toBe(1);
    expect(report.thesisAcceptanceRate).toBe(1);
  });
});
