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
    frameNumber: i + 1,
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
    await expect(index.resolveGop(3, 4, fetchFrom)).resolves.toMatchObject({
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

    await expect(index.resolveGop(4, 5, fetchFrom)).resolves.toMatchObject({
      kf: 0,
    });
    expect(fetchFrom.mock.calls.map(([kf]) => kf)).toEqual([3, 0]);

    // the lie is remembered: the next snap goes straight to sample 0
    expect(index.atOrBefore(4)).toBe(0);
    await index.resolveGop(4, 5, fetchFrom);
    expect(fetchFrom).toHaveBeenCalledTimes(3);
  });

  it("throws when no real keyframe precedes the span", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { samples, fetchFrom } = layout([INTER, INTER, INTER], [0]);
    const index = new KeyframeIndex(samples, VP9);
    await expect(index.resolveGop(2, 3, fetchFrom)).rejects.toThrow(
      /no keyframe at or before decode index 2/,
    );
  });

  it("returns null when there is nothing to fetch", async () => {
    const { samples } = layout([KEY], [0]);
    const index = new KeyframeIndex(samples, VP9);
    await expect(index.resolveGop(0, 1, async () => null)).resolves.toBeNull();
  });
});

// H.264 samples with 4-byte length prefixes. A slice's first payload byte packs
// first_mb_in_slice 0 and slice_type: 0x88 is an I-slice (7), 0xc0 a P-slice
// (0), 0xa0 a B-slice (1).
const avcNal = (header: number, ...payload: number[]) => [
  0,
  0,
  0,
  payload.length + 1,
  header,
  ...payload,
];
const IDR = avcNal(0x65, 0x88);
const P = avcNal(0x41, 0xc0);
const B = avcNal(0x01, 0xa0);
const INTRA = avcNal(0x41, 0x88);
/** An open-GOP I-frame: a recovery-point SEI, then a non-IDR I-slice. */
const RECOVERY = [...avcNal(0x06, 0x06, 0x01, 0xc4, 0x80), ...INTRA];
const AVC = keyframeProbe("avc1.640028");

/** H.264 samples laid out contiguously, presenting in `frames` order. */
const avcLayout = (
  pictures: number[][],
  sync: number[],
  frames = pictures.map((_, i) => i + 1),
) => {
  const samples: SyncSample[] = [];
  let offset = 0;
  pictures.forEach((bytes, i) => {
    samples.push({
      decodeIndex: i,
      frameNumber: frames[i],
      isSync: sync.includes(i),
      offset,
      size: bytes.length,
    });
    offset += bytes.length;
  });
  const buffer = Uint8Array.from(pictures.flat()).buffer;
  const fetchFrom = vi.fn(async (kf: number) => ({
    kf,
    span: { buffer, fileStart: 0 },
  }));
  return { samples, fetchFrom };
};

describe("KeyframeIndex with H.264", () => {
  it("keeps a flagged open-GOP I-frame as a keyframe", async () => {
    const { samples, fetchFrom } = avcLayout(
      [IDR, P, B, RECOVERY, P, B],
      [0, 3],
    );
    const index = new KeyframeIndex(samples, AVC);

    expect(index.chunkType(samples[3], Uint8Array.from(RECOVERY))).toBe("key");
    expect(samples[3].isSync).toBe(true);
    const gop = await index.resolveGop(5, 6, fetchFrom);
    expect(gop?.kf).toBe(3);
    expect(gop?.start).toBeUndefined();
  });

  it("demotes a flagged predicted picture", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { samples, fetchFrom } = avcLayout([IDR, P, P, P], [0, 2]);
    const index = new KeyframeIndex(samples, AVC);

    await expect(index.resolveGop(3, 4, fetchFrom)).resolves.toMatchObject({
      kf: 0,
    });
    expect(samples[2].isSync).toBe(false);
  });

  it("starts from a flagged open-GOP I-frame that opens the file", async () => {
    const { samples, fetchFrom } = avcLayout([RECOVERY, P, B], [0]);
    const index = new KeyframeIndex(samples, AVC);

    const gop = await index.resolveGop(2, 3, fetchFrom);
    expect(gop?.kf).toBe(0);
    expect(gop?.start).toBeUndefined();
  });

  it("starts from an all-intra first sample rather than throwing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { samples, fetchFrom } = avcLayout([INTRA, P, B], [0]);
    const index = new KeyframeIndex(samples, AVC);

    const gop = await index.resolveGop(2, 3, fetchFrom);
    expect(gop?.kf).toBe(0);
    // marked as a start point with a recovery-point SEI in front
    expect(gop?.start?.[4]).toBe(0x06);
  });

  it("snaps past an open GOP's I-frame for its leading pictures", async () => {
    // decode order IDR1 P3 B2 I6 B4 B5: B4 and B5 present before I6
    const { samples, fetchFrom } = avcLayout(
      [IDR, P, B, RECOVERY, B, B],
      [0, 3],
      [1, 3, 2, 6, 4, 5],
    );
    const index = new KeyframeIndex(samples, AVC);

    await expect(index.resolveGop(4, 4, fetchFrom)).resolves.toMatchObject({
      kf: 0,
    });
    await expect(index.resolveGop(3, 6, fetchFrom)).resolves.toMatchObject({
      kf: 3,
    });
  });
});

describe("KeyframeIndex with intra starts", () => {
  /** Answers `start` for the chunk. */
  const starts = (start: Uint8Array | null) => ({
    chunk: vi.fn(async () => start),
  });

  it("starts from a flagged intra picture instead of walking back", async () => {
    const { samples, fetchFrom } = avcLayout([IDR, P, P, INTRA, P], [0, 3]);
    const start = Uint8Array.of(1, 2);
    const index = new KeyframeIndex(samples, AVC, starts(start));

    await expect(index.resolveGop(4, 5, fetchFrom)).resolves.toMatchObject({
      kf: 3,
      start,
    });
    expect(fetchFrom).toHaveBeenCalledTimes(1);
    expect(samples[3].isSync).toBe(true);
  });

  it("keeps a flagged intra picture flagged while decoding through it", () => {
    const { samples } = avcLayout([IDR, INTRA], [0, 1]);
    const index = new KeyframeIndex(samples, AVC, starts(null));

    expect(index.chunkType(samples[1], Uint8Array.from(INTRA))).toBe("delta");
    expect(index.atOrBefore(1)).toBe(1);
  });

  it("demotes and walks back when the picture cannot start a decode", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { samples, fetchFrom } = avcLayout([IDR, P, P, INTRA, P], [0, 3]);
    const index = new KeyframeIndex(samples, AVC, starts(null));

    const gop = await index.resolveGop(4, 5, fetchFrom);
    expect(gop).toMatchObject({ kf: 0 });
    expect(gop?.start).toBeUndefined();
    expect(index.atOrBefore(4)).toBe(0);
  });
});
