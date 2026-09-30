/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import { intraStarts } from "./intraStartProbe";

// 4-byte length prefix, NAL type 1 (non-IDR slice), then first_mb_in_slice 0
// and slice_type as the leading exp-Golomb bits.
const I_SLICE = Uint8Array.of(0, 0, 0, 2, 0x01, 0b10111000);
const P_SLICE = Uint8Array.of(0, 0, 0, 2, 0x01, 0b11000000);

describe("intraStarts", () => {
  it("offers only all-intra pictures as candidates", () => {
    const starts = intraStarts(4, async () => true);
    expect(starts.candidate(I_SLICE)).toBe(true);
    expect(starts.candidate(P_SLICE)).toBe(false);
  });

  it("probes once and returns the SEI-prefixed chunk when it decodes", async () => {
    const decodes = vi.fn(async () => true);
    const starts = intraStarts(4, decodes);

    const chunk = await starts.chunk(I_SLICE);
    expect(chunk?.subarray(4, 5)).toEqual(Uint8Array.of(0x06));
    expect(chunk?.subarray(-I_SLICE.length)).toEqual(I_SLICE);

    await starts.chunk(I_SLICE);
    expect(decodes).toHaveBeenCalledTimes(1);
  });

  it("gives up on the source when the probe fails", async () => {
    const decodes = vi.fn(async () => false);
    const starts = intraStarts(4, decodes);

    await expect(starts.chunk(I_SLICE)).resolves.toBeNull();
    expect(starts.candidate(I_SLICE)).toBe(false);
    await expect(starts.chunk(I_SLICE)).resolves.toBeNull();
    expect(decodes).toHaveBeenCalledTimes(1);
  });

  it("treats a probe that throws as unsupported", async () => {
    const starts = intraStarts(4, () => Promise.reject(new Error("closed")));
    await expect(starts.chunk(I_SLICE)).resolves.toBeNull();
  });

  it("never probes a picture that is not all-intra", async () => {
    const decodes = vi.fn(async () => true);
    const starts = intraStarts(4, decodes);
    await expect(starts.chunk(P_SLICE)).resolves.toBeNull();
    expect(decodes).not.toHaveBeenCalled();
  });
});
