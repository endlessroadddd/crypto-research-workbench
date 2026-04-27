import Fastify from "fastify";
import cors from "@fastify/cors";
import { analyzeCandidateWithAssistant } from "@research/assistant";
import { buildHistoricalSnapshotReplay, buildLiveEventReplay } from "@research/replay";
import { parseManualReviewFeedback } from "@research/review";
import { getBinanceFuturesMovers } from "./radar/movers.js";
import { getBinanceFuturesOIAnomalies } from "./radar/oi-anomalies.js";
import { createDb, loadCandidateDetail, recomputeWorkspace, type WorkspaceSnapshot } from "./service.js";

interface Subscriber {
  id: number;
  reply: import("fastify").FastifyReply;
}

export const buildApp = async () => {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const db = createDb();
  let snapshot: WorkspaceSnapshot = recomputeWorkspace(db);
  let nextSubscriberId = 1;
  const subscribers = new Map<number, Subscriber>();

  const publish = (event: string, payload: unknown): void => {
    const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const subscriber of subscribers.values()) {
      subscriber.reply.raw.write(line);
    }
  };

  app.get("/api/source-coverage", async () => snapshot.sourceCoverage);

  app.get("/api/candidates", async () => snapshot.candidates);

  app.get("/api/reports", async () => snapshot.reportSummary);

  app.get("/api/radar/movers", async () => getBinanceFuturesMovers());

  app.get("/api/radar/oi-anomalies", async () => getBinanceFuturesOIAnomalies());

  app.get("/api/debug/binance-fapi", async () => {
    const url = "https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await globalThis.fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const contentType = response.headers.get("content-type");
      const text = await response.text();
      let parsedJson: unknown = null;
      let jsonParseError: string | null = null;
      try {
        parsedJson = JSON.parse(text);
      } catch (e) {
        jsonParseError = e instanceof Error ? e.message : String(e);
      }
      return {
        ok: response.ok,
        status: response.status,
        contentType,
        bodyPreview: text.slice(0, 300),
        parsedJson: parsedJson ? { symbol: (parsedJson as { symbol?: unknown }).symbol, lastPrice: (parsedJson as { lastPrice?: unknown }).lastPrice, priceChangePercent: (parsedJson as { priceChangePercent?: unknown }).priceChangePercent } : null,
        jsonParseError,
        railwayRegion: process.env.RAILWAY_REGION ?? null
      };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      const isNetworkError = err instanceof TypeError && err.message.includes("fetch");
      return {
        ok: false,
        status: null,
        contentType: null,
        bodyPreview: null,
        parsedJson: null,
        jsonParseError: null,
        error: {
          name: err instanceof Error ? err.name : null,
          message: err instanceof Error ? err.message : String(err),
          isTimeout,
          isNetworkError
        },
        railwayRegion: process.env.RAILWAY_REGION ?? null
      };
    }
  });

  app.get<{ Params: { symbol: string } }>("/api/candidates/:symbol", async (request, reply) => {
    const detail = loadCandidateDetail(db, request.params.symbol);
    if (!detail) {
      return reply.code(404).send({ message: "Candidate not found" });
    }
    return detail;
  });

  app.get<{ Params: { symbol: string } }>("/api/candidates/:symbol/report", async (request, reply) => {
    const symbol = request.params.symbol.toUpperCase();
    const report = snapshot.reports.find((item) => item.symbol.toUpperCase() === symbol);
    if (!report) {
      return reply.code(404).send({ message: "Report not found" });
    }

    return report;
  });

  app.get<{ Params: { symbol: string } }>("/api/candidates/:symbol/replay", async (request, reply) => {
    const detail = loadCandidateDetail(db, request.params.symbol);
    if (!detail) {
      return reply.code(404).send({ message: "Candidate not found" });
    }
    return {
      liveEventReplay: buildLiveEventReplay(db, request.params.symbol),
      historicalSnapshotReplay: buildHistoricalSnapshotReplay(request.params.symbol),
      manualReviewChecklist: detail.checklist,
      calibrationReport: snapshot.reviewReport
    };
  });

  app.post<{ Body: { symbol?: string; question?: string } }>("/api/ai/analyze", async (request, reply) => {
    const symbol = request.body?.symbol?.trim().toUpperCase();
    if (!symbol) {
      return reply.code(400).send({ message: "symbol is required" });
    }

    const detail = loadCandidateDetail(db, symbol);
    if (!detail) {
      return reply.code(404).send({ message: "Candidate not found" });
    }

    return analyzeCandidateWithAssistant({
      candidate: detail.candidate,
      checklist: detail.checklist,
      question: request.body?.question
    });
  });

  app.get("/api/readiness", async () => db.getReadiness());

  app.get("/api/decision-stream", async (_request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders?.();

    const subscriberId = nextSubscriberId++;
    subscribers.set(subscriberId, { id: subscriberId, reply });
    reply.raw.write(`event: bootstrap\ndata: ${JSON.stringify(snapshot)}\n\n`);

    const heartbeat = setInterval(() => {
      reply.raw.write(`event: heartbeat\ndata: ${JSON.stringify({ now: new Date().toISOString() })}\n\n`);
    }, 15000);

    reply.raw.on("close", () => {
      clearInterval(heartbeat);
      subscribers.delete(subscriberId);
    });

    return reply;
  });

  app.post("/api/manual-review", async (request, reply) => {
    const feedback = parseManualReviewFeedback(request.body);
    db.insertManualReview(feedback);
    snapshot = recomputeWorkspace(db);
    publish("refresh", snapshot);
    return reply.send({
      ok: true,
      calibrationReport: snapshot.reviewReport
    });
  });

  app.post("/api/admin/recompute", async () => {
    snapshot = recomputeWorkspace(db);
    publish("refresh", snapshot);
    return {
      generatedAt: snapshot.generatedAt,
      sourceCount: snapshot.sourceCoverage.length,
      candidateCount: snapshot.candidates.length
    };
  });

  app.get("/", async () => ({
    service: "research-workbench-api",
    generatedAt: snapshot.generatedAt,
    candidateCount: snapshot.candidates.length
  }));

  app.addHook("onClose", async () => {
    db.close();
  });

  return app;
};
