import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { snapshotsDir } from "@research/storage";

export const loadFixtureReplay = <T>(name: string): T =>
  JSON.parse(
    readFileSync(resolve(snapshotsDir, `${name}.json`), "utf8")
  ) as T;
