import { describe, expect, it } from "vitest";
import {
  decodedCacheBudgetBytes,
  nextDecodedCacheLookaheadSeconds,
} from "./episode-decoded-cache-policy";

const MIB = 1024 ** 2;

describe("episode decoded cache policy", () => {
  it("scales the byte budget with device memory within safe bounds", () => {
    expect(decodedCacheBudgetBytes(null)).toBe(256 * MIB);
    expect(decodedCacheBudgetBytes(2)).toBe(128 * MIB);
    expect(decodedCacheBudgetBytes(8)).toBe(256 * MIB);
    expect(decodedCacheBudgetBytes(64)).toBe(512 * MIB);
  });

  it("shrinks speculative lookahead without crossing the startup runway", () => {
    expect(
      nextDecodedCacheLookaheadSeconds({
        budgetBytes: 256 * MIB,
        currentSeconds: 4,
        decodedBytes: 512 * MIB,
        maxSeconds: 4,
        minSeconds: 0.5,
        stepSeconds: 1,
      }),
    ).toBe(2);

    expect(
      nextDecodedCacheLookaheadSeconds({
        budgetBytes: 256 * MIB,
        currentSeconds: 1,
        decodedBytes: 1024 * MIB,
        maxSeconds: 4,
        minSeconds: 0.5,
        stepSeconds: 1,
      }),
    ).toBe(0.5);
  });

  it("recovers one batch at a time only below the hysteresis threshold", () => {
    const options = {
      budgetBytes: 256 * MIB,
      currentSeconds: 2,
      maxSeconds: 4,
      minSeconds: 0.5,
      stepSeconds: 1,
    } as const;

    expect(
      nextDecodedCacheLookaheadSeconds({
        ...options,
        decodedBytes: 200 * MIB,
      }),
    ).toBe(2);
    expect(
      nextDecodedCacheLookaheadSeconds({
        ...options,
        decodedBytes: 128 * MIB,
      }),
    ).toBe(3);
  });
});
