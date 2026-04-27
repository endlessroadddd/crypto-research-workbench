import type {
  Candidate,
  BeginnerReportSummary,
  BeginnerTradeReport,
  ManualReviewChecklist,
  ManualReviewFeedback,
  SourceCoverageItem
} from "@research/core";

const API_BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ?? "";
const apiUrl = (path: string): string => `${API_BASE}${path}`;

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `请求失败：${response.status}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`接口返回了不可解析内容：${path}`);
  }
};

export interface HistoricalSnapshotReplayItem {
  symbol: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface CandidateDetailResponse {
  candidate: Candidate;
  checklist: ManualReviewChecklist;
  reviews: ManualReviewFeedback[];
}

export interface CandidateReplayResponse {
  liveEventReplay: {
    symbol: string;
    candidate: Candidate | null;
    manualReviews: ManualReviewFeedback[];
  };
  historicalSnapshotReplay: HistoricalSnapshotReplayItem[];
  manualReviewChecklist: ManualReviewChecklist;
  calibrationReport: {
    totalReviews: number;
    thesisAcceptanceRate: number;
    timingAcceptanceRate: number;
    actionBreakdown: Record<string, number>;
  };
}

export interface AiAdvisorResponse {
  provider: "ollama" | "fallback";
  model: string;
  generatedAt: string;
  safety: {
    allowed: boolean;
    manualOnly: true;
    detectedRisks: string[];
    blockedReason?: string;
  };
  summary: string;
  retrievedContext: string[];
  tradePlan: string[];
  checklist: string[];
  evidenceUsed: string[];
  invalidationRules: string[];
  rawModelOutput?: string;
}

export const fetchSourceCoverage = async (): Promise<SourceCoverageItem[]> => {
  return requestJson<SourceCoverageItem[]>("/api/source-coverage");
};

export const fetchCandidates = async (): Promise<Candidate[]> => {
  return requestJson<Candidate[]>("/api/candidates");
};

export const fetchBeginnerReports = async (): Promise<BeginnerReportSummary> => {
  return requestJson<BeginnerReportSummary>("/api/reports");
};

export const fetchCandidateReport = async (
  symbol: string
): Promise<BeginnerTradeReport> => {
  return requestJson<BeginnerTradeReport>(`/api/candidates/${symbol}/report`);
};

export const fetchCandidateDetail = async (
  symbol: string
): Promise<CandidateDetailResponse> => {
  return requestJson<CandidateDetailResponse>(`/api/candidates/${symbol}`);
};

export const fetchCandidateReplay = async (
  symbol: string
): Promise<CandidateReplayResponse> => {
  return requestJson<CandidateReplayResponse>(`/api/candidates/${symbol}/replay`);
};

export const postManualReview = async (
  payload: ManualReviewFeedback
): Promise<{ ok: boolean }> => {
  return requestJson<{ ok: boolean }>("/api/manual-review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
};

export const postAiAnalysis = async (payload: {
  symbol: string;
  question?: string;
}): Promise<AiAdvisorResponse> => {
  return requestJson<AiAdvisorResponse>("/api/ai/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
};
