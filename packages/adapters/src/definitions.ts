import type { AdapterDefinition } from "./types";

export const adapterDefinitions: AdapterDefinition[] = [
  {
    name: "binance-market-rank",
    family: "rank_aggregator",
    installProfile: "active-only",
    cliCommand: "binance-cli",
    fixtureFile: "binance-market-rank.json",
    active: true
  },
  {
    name: "binance-meme-rush",
    family: "rank_aggregator",
    installProfile: "active-only",
    cliCommand: "binance-cli",
    fixtureFile: "binance-meme-rush.json",
    active: true
  },
  {
    name: "binance-trading-signal",
    family: "rank_aggregator",
    installProfile: "active-only",
    cliCommand: "binance-cli",
    fixtureFile: "binance-trading-signal.json",
    active: true
  },
  {
    name: "binance-query-token-info",
    family: "risk_annotation",
    installProfile: "active-only",
    cliCommand: "binance-cli",
    fixtureFile: "binance-query-token-info.json",
    active: true
  },
  {
    name: "binance-query-token-audit",
    family: "risk_annotation",
    installProfile: "active-only",
    cliCommand: "binance-cli",
    fixtureFile: "binance-query-token-audit.json",
    active: true
  },
  {
    name: "binance-square",
    family: "social_sentiment",
    installProfile: "active-only",
    fixtureFile: "binance-square.json",
    active: true
  },
  {
    name: "okx-onchain-signal",
    family: "onchain_flow",
    installProfile: "active-only",
    cliCommand: "onchainos",
    fixtureFile: "okx-onchain-signal.json",
    active: true
  },
  {
    name: "okx-onchain-trenches",
    family: "onchain_flow",
    installProfile: "active-only",
    cliCommand: "onchainos",
    fixtureFile: "okx-onchain-trenches.json",
    active: true
  },
  {
    name: "okx-onchain-token",
    family: "risk_annotation",
    installProfile: "active-only",
    cliCommand: "onchainos",
    fixtureFile: "okx-onchain-token.json",
    active: true
  },
  {
    name: "market-structure-feed",
    family: "market_structure",
    installProfile: "active-only",
    fixtureFile: "market-structure.json",
    active: true
  },
  {
    name: "binance-square-post",
    family: "social_sentiment",
    installProfile: "full-profile",
    cliCommand: "binance-cli",
    fixtureFile: "dormant-empty.json",
    active: false
  },
  {
    name: "okx-agentic-wallet",
    family: "risk_annotation",
    installProfile: "debug-profile",
    cliCommand: "onchainos",
    fixtureFile: "dormant-empty.json",
    active: false
  }
];

