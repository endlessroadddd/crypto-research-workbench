import { describe, expect, it } from "vitest";
import { loadAdapterRuntimes, loadCoverage } from "./runtime";

describe("adapter runtime", () => {
  it("loads only active adapters for active-only profile", () => {
    const runtimes = loadAdapterRuntimes("active-only");

    expect(runtimes.every((runtime) => runtime.definition.active)).toBe(true);
    expect(runtimes.some((runtime) => runtime.definition.name === "binance-square-post")).toBe(false);
    expect(runtimes.every((runtime) => runtime.coverage.runtimeMode !== undefined)).toBe(true);
  });

  it("marks dormant adapters outside active-only profile", () => {
    const coverage = loadCoverage("full-profile");
    const dormant = coverage.find((item) => item.name === "binance-square-post");

    expect(dormant?.installState).toBe("installed_dormant");
  });
});
