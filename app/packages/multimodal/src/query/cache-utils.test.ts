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

  it("falls back to structural sizing and clamps oversized totals", () => {
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

  it("counts each retained binary backing store once", () => {
    const buffer = new ArrayBuffer(256);
    expect(
      decodedOutputSizeBytes({
        resourceHints: {
          sizeBytes: 1,
          transferables: [buffer],
        },
        visualization: {
          bytes: new Uint8Array(buffer, 0, 16),
          kind: "encoded-image",
        },
      } as DecodedOutput),
    ).toBe(256);
  });

  it("deduplicates shared binary stores without a declared size", () => {
    const buffer = new ArrayBuffer(256);
    expect(
      decodedOutputSizeBytes({
        resourceHints: { transferables: [buffer] },
        visualization: { bytes: new Uint8Array(buffer) },
      } as unknown as DecodedOutput),
    ).toBe(256);
  });

  it("does not recount hinted binary metadata", () => {
    const buffer = new ArrayBuffer(256);
    expect(
      decodedOutputSizeBytes({
        attributes: { bytes: new Uint8Array(buffer) },
        resourceHints: { sizeBytes: 1, transferables: [buffer] },
        timing: { bytes: new Uint8Array(buffer) },
      } as unknown as DecodedOutput),
    ).toBe(256);
  });
});
