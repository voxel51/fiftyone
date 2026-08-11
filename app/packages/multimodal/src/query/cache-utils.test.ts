import { describe, expect, it } from "vitest";

import type { DecodedOutput } from "../ir";
import { decodedOutputSizeBytes } from "./cache-utils";

describe("decodedOutputSizeBytes", () => {
  it("adds metadata estimates to a declared payload size", () => {
    expect(
      decodedOutputSizeBytes({
        attributes: { label: "rgb" },
        resourceHints: { sizeBytes: 128 },
        timing: { decodeMs: 1 },
      } as DecodedOutput),
    ).toBe(139);
  });

  it("falls back to structural sizing and saturates oversized totals", () => {
    expect(decodedOutputSizeBytes({ attributes: { x: 1 } })).toBe(8);
    expect(
      decodedOutputSizeBytes({
        resourceHints: { sizeBytes: Number.NaN },
      } as DecodedOutput),
    ).toBe(0);
    expect(
      decodedOutputSizeBytes({
        resourceHints: { sizeBytes: Number.MAX_SAFE_INTEGER },
        timing: { decodeMs: 1 },
      } as DecodedOutput),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});
