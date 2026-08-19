import { describe, expect, it } from "vitest";

import { nsDeltaToSeconds } from "./nanoseconds";

describe("nanosecond helpers", () => {
  it("converts positive and negative deltas precisely", () => {
    expect(nsDeltaToSeconds(86_400_500_000_001n)).toBe(86_400.500000001);
    expect(nsDeltaToSeconds(-1_500_000_000n)).toBe(-1.5);
  });
});
