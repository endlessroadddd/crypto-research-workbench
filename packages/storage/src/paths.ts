import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(currentDir, "../../../");
const testRunId =
  process.env.VITEST === "true" || process.env.NODE_ENV === "test"
    ? `test-${process.pid}`
    : "";
const serverlessRoot = process.env.VERCEL ? "/tmp/research-workbench" : "";
const runtimeRoot = serverlessRoot || (testRunId ? resolve(repoRoot, ".tmp", testRunId) : repoRoot);
export const dataDir = process.env.RESEARCH_DATA_DIR ?? resolve(runtimeRoot, "data");
export const logsDir = process.env.RESEARCH_LOGS_DIR ?? resolve(runtimeRoot, "logs");
export const snapshotsDir =
  process.env.RESEARCH_SNAPSHOTS_DIR ??
  resolve(runtimeRoot, testRunId || serverlessRoot ? "snapshots" : "fixtures/snapshots");
export const sqlitePath = resolve(dataDir, "research-workbench.sqlite");
export const structureLogPath = resolve(logsDir, "market-structure.jsonl");

export const ensureStoragePaths = (): void => {
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(snapshotsDir, { recursive: true });
};
