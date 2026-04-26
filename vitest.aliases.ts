import { resolve } from "node:path";

export const workspaceAliases = {
  "@research/core": resolve(__dirname, "packages/core/src/index.ts"),
  "@research/adapters": resolve(__dirname, "packages/adapters/src/index.ts"),
  "@research/storage": resolve(__dirname, "packages/storage/src/index.ts"),
  "@research/replay": resolve(__dirname, "packages/replay/src/index.ts"),
  "@research/review": resolve(__dirname, "packages/review/src/index.ts"),
  "@research/assistant": resolve(__dirname, "packages/assistant/src/index.ts")
};
