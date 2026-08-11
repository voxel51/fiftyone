import { afterEach, describe, expect, it, vi } from "vitest";

import { monotonicNowMs } from "./monotonic-time";

describe("monotonicNowMs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the current realm's monotonic clock when available", () => {
    vi.stubGlobal("performance", { now: () => 12.5 });

    expect(monotonicNowMs()).toBe(12.5);
  });

  it("falls back to wall time without a performance clock", () => {
    vi.stubGlobal("performance", undefined);
    vi.spyOn(Date, "now").mockReturnValue(42);

    expect(monotonicNowMs()).toBe(42);
  });
});
