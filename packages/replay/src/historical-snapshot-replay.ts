import { readStructureEntries } from "@research/storage";

export const buildHistoricalSnapshotReplay = (symbol: string) =>
  readStructureEntries().filter((entry) => entry.symbol === symbol).slice(-50);

