import { defineConfig } from "vitest/config";
import { workspaceAliases } from "../../vitest.aliases";

export default defineConfig({
  test: {
    environment: "node"
  },
  resolve: {
    alias: workspaceAliases
  }
});
