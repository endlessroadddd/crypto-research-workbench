export interface MoverItem {
  rank: number;
  symbol: string;
  baseAsset: string;
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  quoteVolumeText: string;
  sparkline: number[];
}

export interface UpstreamDiagnostic {
  upstreamUrl: string;
  upstreamHttpStatus: number | null;
  upstreamContentType: string | null;
  upstreamBodyPreview: string | null;
  errorName: string | null;
  errorMessage: string | null;
  isTimeout: boolean;
  isJsonParseError: boolean;
  isNetworkError: boolean;
  railwayRegion: string | null;
}

export interface MoversResponse {
  generatedAt: string;
  source: "binance";
  marketType: "USDT-M Futures";
  status?: "healthy" | "degraded";
  error?: {
    code: "BINANCE_UPSTREAM_ERROR";
    message: string;
    diagnostic?: UpstreamDiagnostic;
  };
  gainers: MoverItem[];
  losers: MoverItem[];
}

interface BinanceTicker24h {
  symbol?: unknown;
  lastPrice?: unknown;
  priceChangePercent?: unknown;
  quoteVolume?: unknown;
}

import { buildProxyAwareFetch, type FetchLike, type FetchLikeResponse } from "./utils.js";

const BINANCE_FUTURES_TICKER_24H = "https://fapi.binance.com/fapi/v1/ticker/24hr";
const CACHE_TTL_MS = 60_000;
const MIN_QUOTE_VOLUME = 1_000_000;
const DEFAULT_LIMIT = 20;

let cachedResponse: {
  expiresAt: number;
  payload: MoversResponse;
} | null = null;

export const formatQuoteVolumeText = (value: number): string => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (absolute >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }

  if (absolute >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }

  return `$${value.toFixed(2)}`;
};

const toFiniteNumber = (value: unknown): number | null => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const degradedResponse = (diagnostic?: UpstreamDiagnostic): MoversResponse => ({
  generatedAt: new Date().toISOString(),
  source: "binance",
  marketType: "USDT-M Futures",
  status: "degraded",
  error: {
    code: "BINANCE_UPSTREAM_ERROR",
    message: "Binance public market data is temporarily unavailable.",
    ...(diagnostic ? { diagnostic } : {})
  },
  gainers: [],
  losers: []
});

export const buildMoversResponse = (
  tickers: unknown,
  limit = DEFAULT_LIMIT
): MoversResponse => {
  if (!Array.isArray(tickers)) {
    return degradedResponse();
  }

  const movers = tickers.flatMap((ticker): Omit<MoverItem, "rank">[] => {
    const item = ticker as BinanceTicker24h;
    const symbol = typeof item.symbol === "string" ? item.symbol : "";
    if (!symbol.endsWith("USDT")) {
      return [];
    }

    const lastPrice = toFiniteNumber(item.lastPrice);
    const priceChangePercent = toFiniteNumber(item.priceChangePercent);
    const quoteVolume = toFiniteNumber(item.quoteVolume);
    if (lastPrice === null || priceChangePercent === null || quoteVolume === null) {
      return [];
    }

    if (quoteVolume < MIN_QUOTE_VOLUME) {
      return [];
    }

    return [
      {
        symbol,
        baseAsset: symbol.slice(0, -"USDT".length),
        lastPrice,
        priceChangePercent,
        quoteVolume,
        quoteVolumeText: formatQuoteVolumeText(quoteVolume),
        sparkline: []
      }
    ];
  });

  const ranked = (items: Omit<MoverItem, "rank">[]): MoverItem[] =>
    items.slice(0, limit).map((item, index) => ({
      rank: index + 1,
      ...item
    }));

  return {
    generatedAt: new Date().toISOString(),
    source: "binance",
    marketType: "USDT-M Futures",
    status: "healthy",
    gainers: ranked([...movers].sort((left, right) => right.priceChangePercent - left.priceChangePercent)),
    losers: ranked([...movers].sort((left, right) => left.priceChangePercent - right.priceChangePercent))
  };
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

export const getBinanceFuturesMovers = async (
  options: {
    now?: number;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    proxyUrl?: string;
  } = {}
): Promise<MoversResponse> => {
  const now = options.now ?? Date.now();
  if (cachedResponse && cachedResponse.expiresAt > now) {
    return cachedResponse.payload;
  }

  let fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    const payload = degradedResponse();
    cachedResponse = {
      expiresAt: now + CACHE_TTL_MS,
      payload
    };
    return payload;
  }

  const proxyUrl = options.proxyUrl ?? process.env.BINANCE_PROXY_URL ?? null;
  fetchImpl = await buildProxyAwareFetch(proxyUrl, fetchImpl);

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      BINANCE_FUTURES_TICKER_24H,
      options.timeoutMs ?? 8_000
    );

    if (!response.ok) {
      let bodyPreview = null;
      let contentType: string | null = null;
      try {
        contentType = response.headers.get("content-type");
        const text = await response.text();
        bodyPreview = text.slice(0, 200);
      } catch {
        // ignore
      }
      throw new Error(`Binance upstream responded with HTTP ${response.status} (${contentType}) body: ${bodyPreview}`);
    }

    const payload = buildMoversResponse(await response.json());
    cachedResponse = {
      expiresAt: now + CACHE_TTL_MS,
      payload
    };
    return payload;
  } catch (err: unknown) {
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    const isNetworkError = err instanceof TypeError && err.message.includes("fetch");
    const isJsonParseError = err instanceof SyntaxError;
    const railwayRegion = process.env.RAILWAY_REGION ?? null;

    const diagnostic: UpstreamDiagnostic = {
      upstreamUrl: BINANCE_FUTURES_TICKER_24H,
      upstreamHttpStatus: null,
      upstreamContentType: null,
      upstreamBodyPreview: null,
      errorName: err instanceof Error ? err.name : null,
      errorMessage: err instanceof Error ? err.message : String(err),
      isTimeout,
      isNetworkError,
      isJsonParseError,
      railwayRegion
    };

    const payload = degradedResponse(diagnostic);
    cachedResponse = {
      expiresAt: now + CACHE_TTL_MS,
      payload
    };
    return payload;
  }
};

export const resetMoversCacheForTest = (): void => {
  cachedResponse = null;
};
