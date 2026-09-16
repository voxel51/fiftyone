/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyframeIndex, type SyncSample } from "./keyframeIndex";
import { keyframeProbe } from "./sampleKeyframe";

// One-byte VP9 samples: 0x82 is a keyframe header, 0x86 an inter frame.
const KEY = 0x82;
const INTER = 0x86;
const VP9 = keyframeProbe("vp09.00.10.08");
const OTHER = keyframeProbe("av01.0.04M.08");

/** A file of one-byte samples laid out contiguously from offset 0. */
const layout = (bytes: number[], sync: number[]) => {
  const samples: SyncSample[] = bytes.map((_, i) => ({
    decodeIndex: i,
    isSync: sync.includes(i),
    offset: i,
    size: 1,
  }));
  const buffer = Uint8Array.from(bytes).buffer;
  const fetchFrom = vi.fn(async (kf: number) =>
    kf < bytes.length ? { kf, span: { buffer, fileStart: 0 } } : null,
  );
  return { samples, fetchFrom };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KeyframeIndex.atOrBefore", () => {
  it("returns the nearest flagged sample at or before an index", () => {
    const { samples } = layout([KEY, INTER, INTER, KEY, INTER], [0, 3]);
    const index = new KeyframeIndex(samples, VP9);
    expect(index.atOrBefore(2)).toBe(0);
    expect(index.atOrBefore(3)).toBe(3);
    expect(index.atOrBefore(4)).toBe(3);
  });
});

describe("KeyframeIndex.chunkType", () => {
  it("types by bytes and demotes a flag the bytes contradict", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { samples } = layout([KEY, INTER, KEY, INTER], [0, 1]);
    const index = new KeyframeIndex(samples, VP9);

    expect(index.chunkType(samples[1], Uint8Array.of(INTER))).toBe("delta");
    expect(samples[1].isSync).toBe(false);
    expect(index.atOrBefore(1)).toBe(0);
    expect(console.warn).toHaveBeenCalledTimes(1);

    // an unflagged keyframe is still sent as one
    expect(index.chunkType(samples[2], Uint8Array.of(KEY))).toBe("key");
  });

  it("trusts the container flag for codecs it does not inspect", () => {
    const { samples } = layout([INTER, INTER], [0]);
    const index = new KeyframeIndex(samples, OTHER);
    expect(index.chunkType(samples[0], Uint8Array.of(INTER))).toBe("key");
    expect(index.chunkType(samples[1], Uint8Array.of(INTER))).toBe("delta");
    expect(samples[0].isSync).toBe(true);
  });
});

describe("KeyframeIndex.resolveGop", () => {
  it("returns the snap target when its bytes confirm a keyframe", async () => {
    const { samples, fetchFrom } = layout([KEY, INTER, KEY, INTER], [0, 2]);
    const index = new KeyframeIndex(samples, VP9);
    await expect(index.resolveGop(3, fetchFrom)).resolves.toMatchObject({
      kf: 2,
    });
    expect(fetchFrom).toHaveBeenCalledTimes(1);
  });

  it("retries from the previous keyframe when the flagged one is a lie", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { samples, fetchFrom } = layout(
      [KEY, INTER, INTER, INTER, INTER],
      [0, 3],
    );
    const index = new KeyframeIndex(samples, VP9);

    await expect(index.resolveGop(4, fetchFrom)).resolves.toMatchObject({
      kf: 0,
    });
    expect(fetchFrom.mock.calls.map(([kf]) => kf)).toEqual([3, 0]);

    // the lie is remembered: the next snap goes straight to sample 0
    expect(index.atOrBefore(4)).toBe(0);
    await index.resolveGop(4, fetchFrom);
    expect(fetchFrom).toHaveBeenCalledTimes(3);
  });

  it("throws when no real keyframe precedes the span", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { samples, fetchFrom } = layout([INTER, INTER, INTER], [0]);
    const index = new KeyframeIndex(samples, VP9);
    await expect(index.resolveGop(2, fetchFrom)).rejects.toThrow(
      /no keyframe at or before decode index 2/,
    );
  });

  it("returns null when there is nothing to fetch", async () => {
    const { samples } = layout([KEY], [0]);
    const index = new KeyframeIndex(samples, VP9);
    await expect(index.resolveGop(0, async () => null)).resolves.toBeNull();
  });
});
