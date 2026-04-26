export const defaultRouterConfig = {
    thresholds: {
        watchlistScore: 0.35,
        candidateScore: 0.7,
        highConfidenceScore: 0.82,
        corroborationCap: 0.15,
        resonanceCap: 0.15
    },
    lifecycleMultipliers: {
        onchain_early: 0.72,
        cex_transition: 0.95,
        cex_liquid: 1.12,
        late_speculative: 0.65
    },
    regimeMultipliers: {
        trend_expansion: 1.15,
        trend_mature: 1.05,
        range_chop: 0.55,
        blowoff_exhaustion: 1.1,
        range_distribution: 0.6,
        data_degraded: 0.25
    },
    freshnessDegradingFloor: 0.2
};
export const sourcePins = {
    "binance-market-rank": {
        pinnedVersion: "binance-cli@planned",
        pinnedSha: "binance-skills-hub@pending-vendor-pin",
        installProfile: "active-only"
    },
    "binance-meme-rush": {
        pinnedVersion: "binance-cli@planned",
        pinnedSha: "binance-skills-hub@pending-vendor-pin",
        installProfile: "active-only"
    },
    "binance-trading-signal": {
        pinnedVersion: "binance-cli@planned",
        pinnedSha: "binance-skills-hub@pending-vendor-pin",
        installProfile: "active-only"
    },
    "binance-query-token-info": {
        pinnedVersion: "binance-cli@planned",
        pinnedSha: "binance-skills-hub@pending-vendor-pin",
        installProfile: "active-only"
    },
    "binance-query-token-audit": {
        pinnedVersion: "binance-cli@planned",
        pinnedSha: "binance-skills-hub@pending-vendor-pin",
        installProfile: "active-only"
    },
    "binance-square": {
        pinnedVersion: "scraper@0.1.0",
        pinnedSha: "local-parser@v3",
        installProfile: "active-only"
    },
    "okx-onchain-signal": {
        pinnedVersion: "onchainos@planned",
        pinnedSha: "onchainos-skills@pending-vendor-pin",
        installProfile: "active-only"
    },
    "okx-onchain-trenches": {
        pinnedVersion: "onchainos@planned",
        pinnedSha: "onchainos-skills@pending-vendor-pin",
        installProfile: "active-only"
    },
    "okx-onchain-token": {
        pinnedVersion: "onchainos@planned",
        pinnedSha: "onchainos-skills@pending-vendor-pin",
        installProfile: "active-only"
    },
    "market-structure-feed": {
        pinnedVersion: "binance-api@v3",
        pinnedSha: "adapter@local-v3",
        installProfile: "active-only"
    }
};
export const coreStructureSources = ["market-structure-feed"];
//# sourceMappingURL=config.js.map