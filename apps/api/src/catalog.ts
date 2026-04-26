import type { CandidateInput } from "@research/core";

export const candidateCatalog: Record<
  string,
  Omit<CandidateInput, "evidence">
> = {
  ORDI: {
    symbol: "ORDI",
    baseAsset: "ORDI",
    quoteAsset: "USDT",
    chain: "bitcoin",
    contractAddresses: [],
    marketType: "both"
  },
  BAN: {
    symbol: "BAN",
    baseAsset: "BAN",
    quoteAsset: "USDT",
    chain: "solana",
    contractAddresses: ["So11111111111111111111111111111111111111112"],
    marketType: "both"
  },
  ASTER: {
    symbol: "ASTER",
    baseAsset: "ASTER",
    quoteAsset: "USDT",
    chain: "solana",
    contractAddresses: ["So11111111111111111111111111111111111111113"],
    marketType: "spot"
  },
  HYPE: {
    symbol: "HYPE",
    baseAsset: "HYPE",
    quoteAsset: "USDT",
    chain: "solana",
    contractAddresses: ["So11111111111111111111111111111111111111114"],
    marketType: "both"
  },
  SOON: {
    symbol: "SOON",
    baseAsset: "SOON",
    quoteAsset: "USDT",
    chain: "ethereum",
    contractAddresses: ["0x1000000000000000000000000000000000000005"],
    marketType: "both"
  }
};

