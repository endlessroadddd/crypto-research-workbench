import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

vi.mock("./api", () => ({
  fetchBeginnerReports: vi.fn(async () => ({
    generatedAt: "2026-04-27T00:00:00.000Z",
    headline: "今日结论：暂不建议开单",
    overallRecommendation: "暂不建议开单",
    reason: "当前实时数据覆盖不足，系统没有发现明确高分候选。",
    advice: "今天先观望，不要为了交易而交易。",
    dataConfidence: "低",
    realtimeCoverage: 0,
    reports: []
  })),
  fetchSourceCoverage: vi.fn(async () => []),
  fetchCandidates: vi.fn(async () => []),
  fetchCandidateDetail: vi.fn(async () => null),
  fetchCandidateReplay: vi.fn(async () => null),
  postAiAnalysis: vi.fn(async () => ({
    provider: "fallback",
    model: "test",
    generatedAt: new Date().toISOString(),
    safety: {
      allowed: true,
      manualOnly: true,
      detectedRisks: []
    },
    summary: "test",
    retrievedContext: [],
    tradePlan: [],
    checklist: [],
    evidenceUsed: [],
    invalidationRules: []
  })),
  postManualReview: vi.fn(async () => ({ ok: true }))
}));

beforeEach(() => {
  class MockEventSource {
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }

  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders beginner trade report title", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        },
        mutations: {
          retry: false
        }
      }
    });

    const view = render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByText("今日结论：暂不建议开单")).toBeTruthy();
    expect(screen.getByText("本系统仅用于交易研究辅助，不构成投资建议。")).toBeTruthy();

    client.clear();
    view.unmount();
  });
});
