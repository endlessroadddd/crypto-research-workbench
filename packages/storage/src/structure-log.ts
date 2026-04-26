import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Evidence } from "@research/core";
import { snapshotsDir, structureLogPath, ensureStoragePaths } from "./paths";

export interface StructureLogEntry {
  symbol: string;
  timestamp: string;
  payload: Evidence;
}

export const appendStructureEntries = (entries: Evidence[]): void => {
  ensureStoragePaths();
  entries.forEach((entry) => {
    const logEntry: StructureLogEntry = {
      symbol: entry.symbol,
      timestamp: entry.timestamp,
      payload: entry
    };
    appendFileSync(structureLogPath, `${JSON.stringify(logEntry)}\n`, "utf8");
  });
};

export const readStructureEntries = (): StructureLogEntry[] => {
  if (!existsSync(structureLogPath)) {
    return [];
  }

  return readFileSync(structureLogPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StructureLogEntry);
};

export const writeWindowSnapshot = (entries: StructureLogEntry[]): string => {
  ensureStoragePaths();
  const snapshotPath = `${snapshotsDir}/structure-window-latest.json`;
  writeFileSync(snapshotPath, JSON.stringify(entries, null, 2), "utf8");
  return snapshotPath;
};

