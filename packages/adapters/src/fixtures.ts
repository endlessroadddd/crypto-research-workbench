import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(currentDir, "../../../");

export const fixturePath = (relativePath: string): string =>
  resolve(repoRoot, "fixtures", "payloads", relativePath);

export const loadJsonFixture = <T>(relativePath: string): T => {
  const absolutePath = fixturePath(relativePath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
};

export const hasFixture = (relativePath: string): boolean =>
  existsSync(fixturePath(relativePath));

