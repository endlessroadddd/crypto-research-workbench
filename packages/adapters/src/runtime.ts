import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { sourcePins } from "@research/core";
import type {
  CandidateInput,
  Evidence,
  InstallProfile,
  SourceCoverageItem
} from "@research/core";
import { hasFixture, loadJsonFixture, fixturePath } from "./fixtures";
import { adapterDefinitions } from "./definitions";
import type { AdapterDefinition, AdapterRuntime } from "./types";

interface RawFixtureEvidence {
  symbol: string;
  subsource: string;
  category: Evidence["category"];
  direction: Evidence["direction"];
  timestamp: string;
  ttlMs: number;
  degradingStartRatio: number;
  strength: number;
  confidence: number;
  sameFamilyDedupeKey: string;
  crossFamilyThemeKey?: string;
  details?: Record<string, unknown>;
}

type CandidateMetadata = Omit<CandidateInput, "evidence">;

interface LiveLoadResult {
  evidence: RawFixtureEvidence[];
  candidateMetadata: Record<string, CandidateMetadata>;
  runtimeMode: SourceCoverageItem["runtimeMode"];
  status: SourceCoverageItem["status"];
  readiness: boolean;
  rateLimited: boolean;
  retrying: boolean;
  backoffLevel: number;
  retryAt?: string;
  lastUpdated?: string;
  errors: string[];
}

interface OnchainResponse<T> {
  ok?: boolean;
  data?: T;
}

interface OnchainSignalItem {
  amountUsd?: string;
  chainIndex?: string;
  price?: string;
  soldRatioPercent?: string;
  timestamp?: string;
  triggerWalletCount?: string;
  walletType?: string;
  token?: {
    holders?: string;
    marketCapUsd?: string;
    name?: string;
    symbol?: string;
    tokenAddress?: string;
    top10HolderPercent?: string;
  };
}

interface HotTokenItem {
  chainIndex?: string;
  change?: string;
  holders?: string;
  inflowUsd?: string;
  liquidity?: string;
  marketCap?: string;
  price?: string;
  riskLevelControl?: string;
  tokenContractAddress?: string;
  tokenSymbol?: string;
  top10HoldPercent?: string;
  bundleHoldPercent?: string;
}

interface MemepumpTokenItem {
  bondingPercent?: string;
  chainIndex?: string;
  createdTimestamp?: string;
  market?: {
    buyTxCount1h?: string;
    marketCapUsd?: string;
    sellTxCount1h?: string;
    txCount1h?: string;
    volumeUsd1h?: string;
  };
  name?: string;
  symbol?: string;
  tags?: {
    bundlersPercent?: string;
    freshWalletsPercent?: string;
    insidersPercent?: string;
    snipersPercent?: string;
    top10HoldingsPercent?: string;
    totalHolders?: string;
  };
  tokenAddress?: string;
}

const BINANCE_WATCHLIST = ["ORDIUSDT", "BANUSDT", "ASTERUSDT", "HYPEUSDT", "SOONUSDT"];
const EXTRA_PATH = `${homedir()}/.local/bin`;
const COMMAND_TIMEOUT_MS = 12_000;
const liveRuntimeEnabled =
  process.env.RESEARCH_DISABLE_LIVE !== "1" &&
  process.env.VITEST !== "true" &&
  process.env.NODE_ENV !== "test";

const runtimeEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: `${EXTRA_PATH}:${process.env.PATH ?? ""}`
});

const commandExists = (command: string): boolean => {
  try {
    execFileSync("which", [command], {
      stdio: "pipe",
      encoding: "utf8",
      env: runtimeEnv()
    });
    return true;
  } catch {
    return false;
  }
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
};

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

const isoTimestamp = (value?: string): string => {
  if (!value) {
    return new Date().toISOString();
  }

  if (/^\d+$/.test(value)) {
    return new Date(Number(value)).toISOString();
  }

  return new Date(value).toISOString();
};

const chainFromIndex = (value?: string): string | null => {
  const mapping: Record<string, string> = {
    "1": "ethereum",
    "56": "bsc",
    "196": "xlayer",
    "501": "solana",
    "8453": "base"
  };
  return value ? mapping[value] ?? null : null;
};

const normalizeBaseAsset = (value?: string): string => {
  const trimmed = (value ?? "TOKEN").trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : "TOKEN";
};

const buildLiveSymbol = (symbol: string, address?: string): string => {
  const base = normalizeBaseAsset(symbol);
  if (!address) {
    return base;
  }

  return `${base}@${address.slice(0, 4).toUpperCase()}`;
};

const buildMetadata = ({
  symbol,
  baseAsset,
  address,
  chain,
  marketType = "spot"
}: {
  symbol: string;
  baseAsset?: string;
  address?: string;
  chain?: string | null;
  marketType?: CandidateMetadata["marketType"];
}): CandidateMetadata => ({
  symbol,
  baseAsset: baseAsset ?? symbol,
  quoteAsset: marketType === "spot" ? "USD" : "USDT",
  chain,
  contractAddresses: address ? [address] : [],
  marketType
});

const normalizeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message.trim();
  }

  return String(error);
};

const isRateLimitError = (message: string): boolean =>
  /rate limit|too many requests|429/i.test(message);

const runJsonCommand = <T>(
  command: string,
  args: string[],
  timeoutMs = COMMAND_TIMEOUT_MS
): T => {
  const stdout = execFileSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: runtimeEnv(),
    timeout: timeoutMs
  });

  return JSON.parse(stdout.trim()) as T;
};

const rebaseFixturePayload = (payload: RawFixtureEvidence[]): RawFixtureEvidence[] => {
  if (payload.length === 0) {
    return payload;
  }

  const now = Date.now();
  const latest = payload.reduce((max, item) => {
    const value = new Date(item.timestamp).getTime();
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  if (!latest) {
    return payload;
  }

  const delta = now - latest - 30_000;

  return payload.map((item) => ({
    ...item,
    timestamp: new Date(new Date(item.timestamp).getTime() + delta).toISOString()
  }));
};

const buildEvidence = (
  definition: AdapterDefinition,
  payload: RawFixtureEvidence[]
): Evidence[] =>
  payload.map((item, index) => ({
    id: `${definition.name}:${item.symbol}:${index}`,
    symbol: item.symbol,
    source: definition.name,
    subsource: item.subsource,
    sourceFamily: definition.family,
    category: item.category,
    direction: item.direction,
    timestamp: item.timestamp,
    ttlMs: item.ttlMs,
    degradingStartRatio: item.degradingStartRatio,
    freshnessState: "fresh",
    freshnessWeight: 1,
    strength: item.strength,
    confidence: item.confidence,
    sameFamilyDedupeKey: item.sameFamilyDedupeKey,
    crossFamilyThemeKey: item.crossFamilyThemeKey,
    isPrimary: true,
    rawRef: fixturePath(definition.fixtureFile),
    details: item.details
  }));

const emptyLiveResult = (): LiveLoadResult => ({
  evidence: [],
  candidateMetadata: {},
  runtimeMode: "unavailable",
  status: "unavailable",
  readiness: false,
  rateLimited: false,
  retrying: false,
  backoffLevel: 0,
  errors: []
});

const loadOkxSignalLive = (): LiveLoadResult => {
  const response = runJsonCommand<OnchainResponse<OnchainSignalItem[]>>("onchainos", [
    "signal",
    "list",
    "--chain",
    "solana",
    "--limit",
    "12"
  ]);

  const rows = response.data ?? [];
  const candidateMetadata: Record<string, CandidateMetadata> = {};
  const evidence: RawFixtureEvidence[] = rows.map((item) => {
    const token = item.token ?? {};
    const liveSymbol = buildLiveSymbol(token.symbol ?? token.name ?? "TOKEN", token.tokenAddress);
    candidateMetadata[liveSymbol] = buildMetadata({
      symbol: liveSymbol,
      baseAsset: token.symbol ?? token.name ?? liveSymbol,
      address: token.tokenAddress,
      chain: chainFromIndex(item.chainIndex),
      marketType: "spot"
    });

    const soldRatio = toNumber(item.soldRatioPercent);
    const triggerWalletCount = toNumber(item.triggerWalletCount);
    const amountUsd = toNumber(item.amountUsd);

    return {
      symbol: liveSymbol,
      subsource: `signal_${item.walletType ?? "1"}_live`,
      category: "discovery",
      direction: "bullish",
      timestamp: isoTimestamp(item.timestamp),
      ttlMs: 2_700_000,
      degradingStartRatio: 0.8,
      strength: clamp(triggerWalletCount / 5 + Math.min(amountUsd / 5_000, 0.45), 0.2, 0.96),
      confidence: clamp(0.55 + (100 - soldRatio) / 250, 0.45, 0.92),
      sameFamilyDedupeKey: `signal:${item.walletType ?? "1"}`,
      crossFamilyThemeKey: token.symbol ? `okx-signal:${token.symbol.toUpperCase()}` : undefined,
      details: {
        amountUsd,
        holders: token.holders,
        marketCapUsd: token.marketCapUsd,
        soldRatioPercent: soldRatio,
        top10HolderPercent: token.top10HolderPercent,
        triggerWalletCount,
        tokenAddress: token.tokenAddress
      }
    };
  });

  return {
    evidence,
    candidateMetadata,
    runtimeMode: "live",
    status: "healthy",
    readiness: evidence.length > 0,
    rateLimited: false,
    retrying: false,
    backoffLevel: 0,
    lastUpdated: new Date().toISOString(),
    errors: []
  };
};

const loadOkxTrenchesLive = (): LiveLoadResult => {
  const response = runJsonCommand<OnchainResponse<MemepumpTokenItem[]>>("onchainos", [
    "memepump",
    "tokens",
    "--chain",
    "solana",
    "--stage",
    "NEW",
    "--max-token-age",
    "240",
    "--min-market-cap",
    "10000",
    "--max-market-cap",
    "750000",
    "--min-holders",
    "40"
  ]);

  const rows = (response.data ?? []).slice(0, 12);
  const candidateMetadata: Record<string, CandidateMetadata> = {};
  const evidence: RawFixtureEvidence[] = [];

  rows.forEach((item) => {
    const liveSymbol = buildLiveSymbol(item.symbol ?? item.name ?? "TOKEN", item.tokenAddress);
    candidateMetadata[liveSymbol] = buildMetadata({
      symbol: liveSymbol,
      baseAsset: item.symbol ?? item.name ?? liveSymbol,
      address: item.tokenAddress,
      chain: chainFromIndex(item.chainIndex),
      marketType: "spot"
    });

    const top10 = toNumber(item.tags?.top10HoldingsPercent);
    const bundlers = toNumber(item.tags?.bundlersPercent);
    const freshWallets = toNumber(item.tags?.freshWalletsPercent);
    const txCount1h = toNumber(item.market?.txCount1h);
    const bondingPercent = toNumber(item.bondingPercent);

    evidence.push({
      symbol: liveSymbol,
      subsource: "memepump_new_launch_live",
      category: "discovery",
      direction: "bullish",
      timestamp: isoTimestamp(item.createdTimestamp),
      ttlMs: 2_700_000,
      degradingStartRatio: 0.8,
      strength: clamp(txCount1h / 1500 + bondingPercent / 220, 0.2, 0.94),
      confidence: clamp(0.52 + Math.min(toNumber(item.market?.marketCapUsd) / 300_000, 0.25), 0.45, 0.88),
      sameFamilyDedupeKey: "memepump_new_launch",
      crossFamilyThemeKey: item.symbol ? `memepump:${normalizeBaseAsset(item.symbol)}` : undefined,
      details: {
        bondingPercent,
        marketCapUsd: item.market?.marketCapUsd,
        top10HoldingsPercent: top10,
        bundlersPercent: bundlers,
        freshWalletsPercent: freshWallets,
        txCount1h,
        tokenAddress: item.tokenAddress
      }
    });

    if (top10 >= 24 || bundlers >= 1 || freshWallets >= 8) {
      evidence.push({
        symbol: liveSymbol,
        subsource: "memepump_holder_risk_live",
        category: "risk",
        direction: "risk",
        timestamp: isoTimestamp(item.createdTimestamp),
        ttlMs: 2_700_000,
        degradingStartRatio: 0.8,
        strength: clamp(top10 / 100 + bundlers / 20 + freshWallets / 40, 0.15, 0.9),
        confidence: 0.72,
        sameFamilyDedupeKey: "memepump_holder_risk",
        details: {
          top10HoldingsPercent: top10,
          bundlersPercent: bundlers,
          freshWalletsPercent: freshWallets
        }
      });
    }
  });

  return {
    evidence,
    candidateMetadata,
    runtimeMode: "live",
    status: "healthy",
    readiness: evidence.length > 0,
    rateLimited: false,
    retrying: false,
    backoffLevel: 0,
    lastUpdated: new Date().toISOString(),
    errors: []
  };
};

const loadOkxTokenLive = (): LiveLoadResult => {
  const response = runJsonCommand<OnchainResponse<HotTokenItem[]>>("onchainos", [
    "token",
    "hot-tokens",
    "--chain",
    "solana",
    "--ranking-type",
    "4",
    "--limit",
    "12"
  ]);

  const rows = response.data ?? [];
  const candidateMetadata: Record<string, CandidateMetadata> = {};
  const evidence: RawFixtureEvidence[] = [];

  rows.forEach((item) => {
    const liveSymbol = buildLiveSymbol(item.tokenSymbol ?? "TOKEN", item.tokenContractAddress);
    candidateMetadata[liveSymbol] = buildMetadata({
      symbol: liveSymbol,
      baseAsset: item.tokenSymbol ?? liveSymbol,
      address: item.tokenContractAddress,
      chain: chainFromIndex(item.chainIndex),
      marketType: "spot"
    });

    const top10 = toNumber(item.top10HoldPercent);
    const bundle = toNumber(item.bundleHoldPercent);
    const riskLevel = toNumber(item.riskLevelControl);
    const liquidity = toNumber(item.liquidity);

    if (riskLevel > 1 || top10 >= 22 || bundle >= 4 || liquidity < 20_000) {
      evidence.push({
        symbol: liveSymbol,
        subsource: "token_hot_risk_live",
        category: "risk",
        direction: "risk",
        timestamp: new Date().toISOString(),
        ttlMs: 21_600_000,
        degradingStartRatio: 0.8,
        strength: clamp(riskLevel / 4 + top10 / 100 + bundle / 15 + (liquidity < 20_000 ? 0.18 : 0), 0.15, 0.94),
        confidence: 0.78,
        sameFamilyDedupeKey: "token_hot_risk",
        details: {
          bundleHoldPercent: bundle,
          liquidity,
          marketCap: item.marketCap,
          riskLevelControl: riskLevel,
          top10HoldPercent: top10
        }
      });
    }
  });

  return {
    evidence,
    candidateMetadata,
    runtimeMode: "live",
    status: evidence.length > 0 ? "healthy" : "degraded",
    readiness: true,
    rateLimited: false,
    retrying: false,
    backoffLevel: 0,
    lastUpdated: new Date().toISOString(),
    errors: evidence.length > 0 ? [] : ["okx token hot list returned no risk candidates"]
  };
};

const loadBinanceMarketRankLive = (): LiveLoadResult => {
  const candidateMetadata: Record<string, CandidateMetadata> = {};
  const evidence: RawFixtureEvidence[] = [];

  BINANCE_WATCHLIST.forEach((symbol) => {
    const payload = runJsonCommand<Record<string, string>>("binance-cli", [
      "futures-usds",
      "ticker24hr-price-change-statistics",
      "--symbol",
      symbol
    ]);

    const priceChangePercent = toNumber(payload.priceChangePercent);
    const quoteVolume = toNumber(payload.quoteVolume);
    const direction: Evidence["direction"] = priceChangePercent >= 0 ? "bullish" : "bearish";
    const liveSymbol = symbol.replace(/USDT$/, "");
    candidateMetadata[liveSymbol] = buildMetadata({
      symbol: liveSymbol,
      baseAsset: liveSymbol,
      chain: null,
      marketType: "both"
    });

    evidence.push({
      symbol: liveSymbol,
      subsource: "futures_24h_rank_live",
      category: "discovery",
      direction,
      timestamp: new Date().toISOString(),
      ttlMs: 900_000,
      degradingStartRatio: 0.8,
      strength: clamp(Math.abs(priceChangePercent) / 35 + Math.min(quoteVolume / 250_000_000, 0.28), 0.12, 0.92),
      confidence: clamp(0.55 + Math.min(Math.abs(priceChangePercent) / 100, 0.25), 0.45, 0.88),
      sameFamilyDedupeKey: "futures_24h_rank",
      crossFamilyThemeKey: `binance-futures:${liveSymbol}`,
      details: {
        lastPrice: payload.lastPrice,
        priceChangePercent,
        quoteVolume,
        symbol
      }
    });
  });

  return {
    evidence,
    candidateMetadata,
    runtimeMode: "live",
    status: evidence.length > 0 ? "healthy" : "degraded",
    readiness: evidence.length > 0,
    rateLimited: false,
    retrying: false,
    backoffLevel: 0,
    lastUpdated: new Date().toISOString(),
    errors: []
  };
};

const loadBinanceTradingSignalLive = (): LiveLoadResult => {
  const candidateMetadata: Record<string, CandidateMetadata> = {};
  const evidence: RawFixtureEvidence[] = [];

  BINANCE_WATCHLIST.forEach((symbol) => {
    const payload = runJsonCommand<Array<Record<string, string>>>("binance-cli", [
      "futures-usds",
      "top-trader-long-short-ratio-positions",
      "--symbol",
      symbol,
      "--period",
      "1h",
      "--limit",
      "1"
    ]);

    const item = payload[0];
    if (!item) {
      return;
    }

    const ratio = toNumber(item.longShortRatio);
    const direction: Evidence["direction"] = ratio >= 1 ? "bullish" : "bearish";
    const liveSymbol = symbol.replace(/USDT$/, "");
    candidateMetadata[liveSymbol] = buildMetadata({
      symbol: liveSymbol,
      baseAsset: liveSymbol,
      chain: null,
      marketType: "both"
    });

    evidence.push({
      symbol: liveSymbol,
      subsource: "top_trader_position_ratio_live",
      category: "discovery",
      direction,
      timestamp: isoTimestamp(item.timestamp),
      ttlMs: 600_000,
      degradingStartRatio: 0.8,
      strength: clamp(Math.abs(ratio - 1) / 1.8 + 0.2, 0.15, 0.9),
      confidence: 0.76,
      sameFamilyDedupeKey: "top_trader_position_ratio",
      crossFamilyThemeKey: `binance-ratio:${liveSymbol}`,
      details: {
        longAccount: item.longAccount,
        longShortRatio: ratio,
        shortAccount: item.shortAccount,
        symbol
      }
    });
  });

  return {
    evidence,
    candidateMetadata,
    runtimeMode: "live",
    status: evidence.length > 0 ? "healthy" : "degraded",
    readiness: evidence.length > 0,
    rateLimited: false,
    retrying: false,
    backoffLevel: 0,
    lastUpdated: new Date().toISOString(),
    errors: []
  };
};

const loadMarketStructureLive = (): LiveLoadResult => {
  const candidateMetadata: Record<string, CandidateMetadata> = {};
  const evidence: RawFixtureEvidence[] = [];

  BINANCE_WATCHLIST.forEach((symbol) => {
    const ticker = runJsonCommand<Record<string, string>>("binance-cli", [
      "futures-usds",
      "ticker24hr-price-change-statistics",
      "--symbol",
      symbol
    ]);
    const openInterest = runJsonCommand<Record<string, string>>("binance-cli", [
      "futures-usds",
      "open-interest",
      "--symbol",
      symbol
    ]);
    const fundingHistory = runJsonCommand<Array<Record<string, string>>>("binance-cli", [
      "futures-usds",
      "get-funding-rate-history",
      "--symbol",
      symbol,
      "--limit",
      "1"
    ]);
    const klines = runJsonCommand<Array<[number, string, string, string, string]>>("binance-cli", [
      "futures-usds",
      "kline-candlestick-data",
      "--symbol",
      symbol,
      "--interval",
      "1h",
      "--limit",
      "2"
    ]);

    const lastFunding = fundingHistory[0];
    const lastKline = klines.at(-1);
    const previousKline = klines.at(-2);
    const priceChangePercent = toNumber(ticker.priceChangePercent);
    const openInterestValue = toNumber(openInterest.openInterest);
    const fundingRate = toNumber(lastFunding?.fundingRate);
    const previousClose = previousKline ? toNumber(previousKline[4]) : 0;
    const currentClose = lastKline ? toNumber(lastKline[4]) : 0;
    const currentOpen = lastKline ? toNumber(lastKline[1]) : 0;
    const momentum = previousClose ? (currentClose - previousClose) / previousClose : 0;
    const rejection = currentClose < currentOpen ? Math.abs(currentOpen - currentClose) / currentOpen : 0;
    const liveSymbol = symbol.replace(/USDT$/, "");

    candidateMetadata[liveSymbol] = buildMetadata({
      symbol: liveSymbol,
      baseAsset: liveSymbol,
      chain: null,
      marketType: "both"
    });

    const bearish = priceChangePercent < 0 || (fundingRate > 0.008 && rejection > 0.01);
    evidence.push({
      symbol: liveSymbol,
      subsource: bearish ? "futures_structure_rejection_live" : "futures_structure_acceptance_live",
      category: "confirmation",
      direction: bearish ? "bearish" : "bullish",
      timestamp: new Date().toISOString(),
      ttlMs: 180_000,
      degradingStartRatio: 0.8,
      strength: clamp(
        Math.abs(momentum) * 2.2 +
          Math.min(Math.abs(priceChangePercent) / 35, 0.3) +
          Math.min(openInterestValue / 5_000_000, 0.2),
        0.18,
        0.95
      ),
      confidence: clamp(
        0.55 + Math.min(Math.abs(fundingRate) * 8, 0.15) + Math.min(rejection * 2, 0.12),
        0.45,
        0.9
      ),
      sameFamilyDedupeKey: "futures_structure_live",
      crossFamilyThemeKey: `binance-structure:${liveSymbol}`,
      details: {
        fundingRate,
        momentum,
        openInterest: openInterestValue,
        priceAction: bearish ? "rejection" : "acceptance",
        priceChangePercent,
        symbol
      }
    });
  });

  return {
    evidence,
    candidateMetadata,
    runtimeMode: "live",
    status: evidence.length > 0 ? "healthy" : "degraded",
    readiness: evidence.length > 0,
    rateLimited: false,
    retrying: false,
    backoffLevel: 0,
    lastUpdated: new Date().toISOString(),
    errors: []
  };
};

const liveLoaders: Partial<Record<AdapterDefinition["name"], () => LiveLoadResult>> = {
  "binance-market-rank": loadBinanceMarketRankLive,
  "binance-trading-signal": loadBinanceTradingSignalLive,
  "okx-onchain-signal": loadOkxSignalLive,
  "okx-onchain-trenches": loadOkxTrenchesLive,
  "okx-onchain-token": loadOkxTokenLive,
  "market-structure-feed": loadMarketStructureLive
};

const resolveInstallState = (
  definition: AdapterDefinition,
  profile: InstallProfile
): SourceCoverageItem["installState"] => {
  if (!definition.active) {
    return "installed_dormant";
  }

  if (profile === "active-only") {
    return "installed_active";
  }

  return "installed_active";
};

const shouldLoadForProfile = (
  definition: AdapterDefinition,
  profile: InstallProfile
): boolean => {
  if (definition.active) {
    return true;
  }

  return profile !== "active-only";
};

const attemptLiveLoad = (definition: AdapterDefinition): LiveLoadResult => {
  const loader = liveLoaders[definition.name];
  if (!loader) {
    return {
      ...emptyLiveResult(),
      errors: ["live adapter not implemented"]
    };
  }

  try {
    return loader();
  } catch (error) {
    const message = normalizeError(error);
    return {
      ...emptyLiveResult(),
      status: "degraded",
      rateLimited: isRateLimitError(message),
      errors: [message]
    };
  }
};

const buildCoverage = (
  definition: AdapterDefinition,
  profile: InstallProfile,
  live: LiveLoadResult
): SourceCoverageItem => {
  const samplePayloadAvailable = hasFixture(definition.fixtureFile);
  const cliAvailable = definition.cliCommand ? commandExists(definition.cliCommand) : true;
  const pin = sourcePins[definition.name];
  const errors = [...live.errors];

  if (!samplePayloadAvailable && live.runtimeMode !== "live") {
    errors.push("sample payload missing");
  }

  if (definition.cliCommand && !cliAvailable) {
    errors.push(`${definition.cliCommand} missing`);
  }

  if (live.runtimeMode !== "live" && samplePayloadAvailable) {
    errors.push("using cached snapshot fallback");
  }

  const readiness = Boolean(live.readiness && cliAvailable);
  const runtimeMode =
    live.runtimeMode === "live"
      ? "live"
      : samplePayloadAvailable
        ? "fixture"
        : "unavailable";
  const status =
    live.runtimeMode === "live"
      ? live.status
      : samplePayloadAvailable
        ? "degraded"
        : "unavailable";

  return {
    name: definition.name,
    family: definition.family,
    installProfile: profile,
    installState: resolveInstallState(definition, profile),
    runtimeMode,
    readiness,
    pinnedVersion: pin?.pinnedVersion ?? "unknown",
    pinnedSha: pin?.pinnedSha ?? "unknown",
    lastUpdated:
      live.lastUpdated ??
      (samplePayloadAvailable ? new Date().toISOString() : undefined),
    status,
    rateLimited: live.rateLimited,
    retrying: live.retrying,
    backoffLevel: live.backoffLevel,
    retryAt: live.retryAt,
    samplePayloadAvailable,
    errors: Array.from(new Set(errors))
  };
};

const loadFixtureResult = (definition: AdapterDefinition): LiveLoadResult => {
  const payload = hasFixture(definition.fixtureFile)
    ? rebaseFixturePayload(loadJsonFixture<RawFixtureEvidence[]>(definition.fixtureFile))
    : [];

  return {
    evidence: payload,
    candidateMetadata: {},
    runtimeMode: payload.length > 0 ? "fixture" : "unavailable",
    status: payload.length > 0 ? "degraded" : "unavailable",
    readiness: false,
    rateLimited: false,
    retrying: false,
    backoffLevel: 0,
    lastUpdated: payload.length > 0 ? payload.at(-1)?.timestamp : undefined,
    errors: []
  };
};

export const loadAdapterRuntimes = (
  profile: InstallProfile = "active-only"
): AdapterRuntime[] =>
  adapterDefinitions
    .filter((definition) => shouldLoadForProfile(definition, profile))
    .map((definition) => {
      const live =
        liveRuntimeEnabled &&
        definition.active &&
        (!definition.cliCommand || commandExists(definition.cliCommand))
          ? attemptLiveLoad(definition)
          : emptyLiveResult();
      const fixture = loadFixtureResult(definition);
      const selected = live.runtimeMode === "live" ? live : fixture;
      const coverage = buildCoverage(definition, profile, live);

      return {
        definition,
        coverage,
        evidence: buildEvidence(definition, selected.evidence),
        candidateMetadata: selected.candidateMetadata
      };
    });

export const loadCoverage = (profile: InstallProfile = "active-only"): SourceCoverageItem[] =>
  loadAdapterRuntimes(profile).map((runtime) => runtime.coverage);

export const adapterFixtureExists = (definition: AdapterDefinition): boolean =>
  existsSync(fixturePath(definition.fixtureFile));
