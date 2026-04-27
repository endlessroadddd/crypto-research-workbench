import { getBinanceFuturesMovers, type MoverItem, type MoversResponse } from "./movers.js";

export type OISeverity = "normal" | "high" | "extreme";

export interface OIAnomalyItem {
  rank: number;
  symbol: string;
  baseAsset: string;
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  quoteVolumeText: string;
  openInterestNow: number;
  openInterestPrev?: number;
  openInterestValueNow?: number;
  openInterestValuePrev?: number;
  openInterestChangePercent: number;
  divergenceScore: number;
  severity: OISeverity;
  reason: string;
}

export interface OIAnomaliesResponse {
  generatedAt: string;
  source: "binance";
  marketType: "USDT-M Futures";
  period: "15m";
  status: "healthy" | "degraded";
  items: OIAnomalyItem[];
}

interface BinanceOpenInterestHistItem {
  sumOpenInterest?: unknown;
  sumOpenInterestValue?: unknown;
  timestamp?: unknown;
}

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<FetchLikeResponse>;
type MoversProvider = (options?: { now?: number; fetchImpl?: FetchLike; timeoutMs?: number }) => Promise<MoversResponse>;

const OPEN_INTEREST_HIST_ENDPOINT = "https://fapi.binance.com/futures/data/openInterestHist";
const CACHE_TTL_MS = 60_000;
const PERIOD = "15m";
const OI_LIMIT = 2;
const CANDIDATE_SIDE_LIMIT = 10;
const RESPONSE_LIMIT = 20;
const REQUEST_CONCURRENCY = 4;

let cachedResponse: {
  expiresAt: number;
  payload: OIAnomaliesResponse;
} | null = null;

export const calculateOIChangePercent = (previous: number, current: number): number => {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) {
    return 0;
  }

  return ((current - previous) / previous) * 100;
};

export const calculateDivergenceScore = (
  oiChangePercent: number,
  priceChangePercent: number
): number => {
  const denominator = Math.max(Math.abs(priceChangePercent), 0.5);
  return Math.abs(oiChangePercent) / denominator;
};

export const classifyOISeverity = (
  oiChangePercent: number,
  divergenceScore: number
): OISeverity => {
  const absoluteChange = Math.abs(oiChangePercent);
  if (absoluteChange >= 20 && divergenceScore >= 10) {
    return "extreme";
  }

  if (absoluteChange >= 10 || divergenceScore >= 5) {
    return "high";
  }

  return "normal";
};

export const buildOIReason = (severity: OISeverity, hasEnoughData: boolean): string => {
  if (!hasEnoughData) {
    return "等待更多 OI 历史数据。";
  }

  if (severity === "extreme") {
    return "OI 大幅变化但价格变化相对有限，存在资金异动或多空博弈。";
  }

  if (severity === "high") {
    return "OI 出现明显变化，建议关注合约资金流向。";
  }

  return "OI 变化暂不极端。";
};

const degradedResponse = (): OIAnomaliesResponse => ({
  generatedAt: new Date().toISOString(),
  source: "binance",
  marketType: "USDT-M Futures",
  period: PERIOD,
  status: "degraded",
  items: []
});

const toFiniteNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const extractOpenInterestValue = (
  item: BinanceOpenInterestHistItem | undefined
): {
  selected: number | null;
  openInterest: number | null;
  openInterestValue: number | null;
} => {
  if (!item) {
    return {
      selected: null,
      openInterest: null,
      openInterestValue: null
    };
  }

  const openInterestValue = toFiniteNumber(item.sumOpenInterestValue);
  const openInterest = toFiniteNumber(item.sumOpenInterest);

  return {
    selected: openInterestValue ?? openInterest,
    openInterest,
    openInterestValue
  };
};

export const buildOIAnomalyItem = (
  mover: MoverItem,
  historyPayload: unknown
): Omit<OIAnomalyItem, "rank"> => {
  if (!Array.isArray(historyPayload)) {
    return {
      ...mover,
      openInterestNow: 0,
      openInterestChangePercent: 0,
      divergenceScore: 0,
      severity: "normal",
      reason: buildOIReason("normal", false)
    };
  }

  const sorted = [...historyPayload]
    .map((item) => item as BinanceOpenInterestHistItem)
    .sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0));
  const currentRaw = sorted.at(-1);
  const previousRaw = sorted.at(-2);
  const current = extractOpenInterestValue(currentRaw);
  const previous = extractOpenInterestValue(previousRaw);
  const hasEnoughData =
    sorted.length >= 2 &&
    current.selected !== null &&
    previous.selected !== null &&
    previous.selected > 0;
  const openInterestChangePercent = hasEnoughData
    ? calculateOIChangePercent(previous.selected as number, current.selected as number)
    : 0;

  // MVP note: divergenceScore currently compares 15m OI change against movers'
  // 24h priceChangePercent. Later iterations can replace this with 15m price change.
  const divergenceScore = hasEnoughData
    ? calculateDivergenceScore(openInterestChangePercent, mover.priceChangePercent)
    : 0;
  const severity = classifyOISeverity(openInterestChangePercent, divergenceScore);

  return {
    ...mover,
    openInterestNow: current.selected ?? 0,
    openInterestPrev: previous.selected ?? undefined,
    openInterestValueNow: current.openInterestValue ?? undefined,
    openInterestValuePrev: previous.openInterestValue ?? undefined,
    openInterestChangePercent,
    divergenceScore,
    severity,
    reason: buildOIReason(severity, hasEnoughData)
  };
};

const getCandidateMovers = (movers: MoversResponse): MoverItem[] => {
  const seen = new Set<string>();
  return [...movers.gainers.slice(0, CANDIDATE_SIDE_LIMIT), ...movers.losers.slice(0, CANDIDATE_SIDE_LIMIT)]
    .filter((item) => {
      if (seen.has(item.symbol)) {
        return false;
      }

      seen.add(item.symbol);
      return true;
    })
    .slice(0, RESPONSE_LIMIT);
};

const fetchWithTimeout = async (
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number
): Promise<FetchLikeResponse> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
};

const fetchOIHistory = async (
  symbol: string,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<unknown> => {
  const url = new URL(OPEN_INTEREST_HIST_ENDPOINT);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("period", PERIOD);
  url.searchParams.set("limit", String(OI_LIMIT));
  const response = await fetchWithTimeout(fetchImpl, url.toString(), timeoutMs);
  if (!response.ok) {
    throw new Error(`Binance OI upstream responded with HTTP ${response.status}`);
  }

  return response.json();
};

const mapWithConcurrency = async <Input, Output>(
  items: Input[],
  concurrency: number,
  mapper: (item: Input) => Promise<Output | null>
): Promise<Array<Output | null>> => {
  const results: Array<Output | null> = new Array(items.length).fill(null);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
};

const severityRank: Record<OISeverity, number> = {
  extreme: 0,
  high: 1,
  normal: 2
};

const rankItems = (items: Array<Omit<OIAnomalyItem, "rank">>): OIAnomalyItem[] =>
  [...items]
    .sort((left, right) => {
      const severityDelta = severityRank[left.severity] - severityRank[right.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      const divergenceDelta = right.divergenceScore - left.divergenceScore;
      if (divergenceDelta !== 0) {
        return divergenceDelta;
      }

      const oiDelta = Math.abs(right.openInterestChangePercent) - Math.abs(left.openInterestChangePercent);
      if (oiDelta !== 0) {
        return oiDelta;
      }

      return right.quoteVolume - left.quoteVolume;
    })
    .slice(0, RESPONSE_LIMIT)
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));

export const getBinanceFuturesOIAnomalies = async (
  options: {
    now?: number;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    moversProvider?: MoversProvider;
  } = {}
): Promise<OIAnomaliesResponse> => {
  const now = options.now ?? Date.now();
  if (cachedResponse && cachedResponse.expiresAt > now) {
    return cachedResponse.payload;
  }

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetchImpl) {
    const payload = degradedResponse();
    cachedResponse = {
      expiresAt: now + CACHE_TTL_MS,
      payload
    };
    return payload;
  }

  const moversProvider = options.moversProvider ?? getBinanceFuturesMovers;
  const movers = await moversProvider({
    now,
    fetchImpl,
    timeoutMs: options.timeoutMs
  });
  const candidates = movers.status === "degraded" ? [] : getCandidateMovers(movers);
  if (candidates.length === 0) {
    const payload = degradedResponse();
    cachedResponse = {
      expiresAt: now + CACHE_TTL_MS,
      payload
    };
    return payload;
  }

  const results = await mapWithConcurrency(candidates, REQUEST_CONCURRENCY, async (mover) => {
    try {
      const history = await fetchOIHistory(mover.symbol, fetchImpl, options.timeoutMs ?? 8_000);
      return buildOIAnomalyItem(mover, history);
    } catch {
      return null;
    }
  });
  const items = rankItems(results.filter((item): item is Omit<OIAnomalyItem, "rank"> => item !== null));
  const payload: OIAnomaliesResponse =
    items.length === 0
      ? degradedResponse()
      : {
          generatedAt: new Date().toISOString(),
          source: "binance",
          marketType: "USDT-M Futures",
          period: PERIOD,
          status: "healthy",
          items
        };

  cachedResponse = {
    expiresAt: now + CACHE_TTL_MS,
    payload
  };
  return payload;
};

export const resetOIAnomaliesCacheForTest = (): void => {
  cachedResponse = null;
};
