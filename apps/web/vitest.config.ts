import { defineConfig } from "vitest/config";
import { workspaceAliases } from "../../vitest.aliases";

export default defineConfig({
  resolve: {
    alias: workspaceAliases
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"]
  }
});
