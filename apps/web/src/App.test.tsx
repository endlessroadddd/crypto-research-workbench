import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

vi.mock("./api", () => ({
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
  it("renders dashboard title", async () => {
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

    expect(await screen.findByText("研究台 v3")).toBeTruthy();

    client.clear();
    view.unmount();
  });
});
