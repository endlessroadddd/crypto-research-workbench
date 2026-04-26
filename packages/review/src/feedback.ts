import { z } from "zod";
import type { ManualReviewFeedback } from "@research/core";

export const manualReviewFeedbackSchema = z.object({
  candidateId: z.string().min(1),
  reviewedAt: z.string().datetime(),
  reviewerAction: z.enum(["dismiss", "watch", "long-bias", "short-bias"]),
  reviewerNotes: z.string().optional(),
  thesisAccepted: z.boolean(),
  timingAccepted: z.boolean()
});

export const parseManualReviewFeedback = (
  input: unknown
): ManualReviewFeedback => manualReviewFeedbackSchema.parse(input);

