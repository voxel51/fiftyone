import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getGridPosterCache,
  resetGridPosterCacheForTests,
} from "./grid-poster-cache";
import { createGridPosterEncoder } from "./grid-poster-codec";

afterEach(() => resetGridPosterCacheForTests());

describe("grid poster codec", () => {
  it("encodes WebP and falls back to PNG when the browser rejects it", async () => {
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    const encode = vi
      .fn()
      .mockResolvedValueOnce(encodedBlob([], "image/webp"))
      .mockResolvedValueOnce(encodedBlob([7, 8], "image/png"));
    const encoder = createGridPosterEncoder({
      cloneCanvas: () => ownedCanvas(),
      concurrency: 1,
      encode,
    });
    encoder.capture(capture("fallback"));
    await vi.waitFor(() =>
      expect(getGridPosterCache().peek("fallback")).not.toBeNull(),
    );

    expect(encode).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "image/webp",
      0.8,
    );
    expect(encode).toHaveBeenNthCalledWith(2, expect.anything(), "image/png");
    expect(getGridPosterCache().peek("fallback")).toMatchObject({
      bytes: new Uint8Array([7, 8]),
      mimeType: "image/png",
    });
  });

  it("bounds concurrency and coalesces the latest pending job per key", async () => {
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    const releases: Array<(blob: Blob) => void> = [];
    let active = 0;
    let maximum = 0;
    const encode = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      const blob = await new Promise<Blob>((resolve) => releases.push(resolve));
      active -= 1;
      return blob;
    });
    const encoder = createGridPosterEncoder({
      cloneCanvas: () => ownedCanvas(),
      concurrency: 1,
      encode,
    });
    encoder.capture(capture("a", 10));
    encoder.capture(capture("b", 20));
    encoder.capture(capture("b", 30));
    expect(encode).toHaveBeenCalledTimes(1);
    releases.shift()?.(encodedBlob([1], "image/webp"));
    await vi.waitFor(() => expect(encode).toHaveBeenCalledTimes(2));
    releases.shift()?.(encodedBlob([2], "image/webp"));
    await vi.waitFor(() =>
      expect(getGridPosterCache().peek("b")?.width).toBe(30),
    );
    expect(maximum).toBe(1);
  });

  it("drops the oldest queued capture when the pending queue is full", async () => {
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    const releases: Array<(blob: Blob) => void> = [];
    const canvases: OffscreenCanvas[] = [];
    const encode = vi.fn(
      () => new Promise<Blob>((resolve) => releases.push(resolve)),
    );
    const encoder = createGridPosterEncoder({
      cloneCanvas: () => {
        const canvas = ownedCanvas();
        canvases.push(canvas);
        return canvas;
      },
      concurrency: 1,
      encode,
      maxPendingCaptures: 2,
    });

    encoder.capture(capture("active"));
    encoder.capture(capture("dropped"));
    encoder.capture(capture("queued-a"));
    encoder.capture(capture("queued-b"));

    expect(canvases[1]).toMatchObject({ height: 0, width: 0 });
    releases.shift()?.(encodedBlob([1], "image/webp"));
    await vi.waitFor(() => expect(encode).toHaveBeenCalledTimes(2));
    releases.shift()?.(encodedBlob([2], "image/webp"));
    await vi.waitFor(() => expect(encode).toHaveBeenCalledTimes(3));
    releases.shift()?.(encodedBlob([3], "image/webp"));
    await vi.waitFor(() =>
      expect(getGridPosterCache().peek("queued-b")).not.toBeNull(),
    );

    expect(getGridPosterCache().peek("dropped")).toBeNull();
  });

  it("does not commit an encode that completes after reset", async () => {
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    const canvas = ownedCanvas();
    let resolveEncode: ((blob: Blob) => void) | undefined;
    const encoder = createGridPosterEncoder({
      cloneCanvas: () => canvas,
      concurrency: 1,
      encode: () =>
        new Promise<Blob>((resolve) => {
          resolveEncode = resolve;
        }),
    });

    encoder.capture(capture("reset"));
    encoder.reset();
    resolveEncode?.(encodedBlob([1], "image/webp"));
    await vi.waitFor(() =>
      expect(canvas).toMatchObject({ height: 0, width: 0 }),
    );

    expect(getGridPosterCache().peek("reset")).toBeNull();
    expect(getGridPosterCache().stats().encodesCompleted).toBe(0);
  });

  it("records a completed encode only when the cache accepts it", async () => {
    resetGridPosterCacheForTests({ maxSizeBytes: 257 });
    const encoder = createGridPosterEncoder({
      cloneCanvas: () => ownedCanvas(),
      encode: vi.fn().mockResolvedValue(encodedBlob([1, 2], "image/webp")),
    });

    encoder.capture(capture("oversize"));
    await vi.waitFor(() =>
      expect(getGridPosterCache().stats().oversizeRejections).toBe(1),
    );

    expect(getGridPosterCache().stats().encodesCompleted).toBe(0);
    expect(getGridPosterCache().peek("oversize")).toBeNull();
  });

  it("treats encoder failures as cache misses", async () => {
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    const encoder = createGridPosterEncoder({
      cloneCanvas: () => ownedCanvas(),
      encode: vi.fn().mockRejectedValue(new Error("encode failed")),
    });
    encoder.capture(capture("failed"));
    await vi.waitFor(() =>
      expect(getGridPosterCache().stats().encodesFailed).toBe(1),
    );
    expect(getGridPosterCache().peek("failed")).toBeNull();
  });

  it("skips encoding when the cached poster is already large enough", () => {
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    getGridPosterCache().put("current", {
      ...capture("current", 30).entry,
      bytes: new Uint8Array([1]),
    });
    const cloneCanvas = vi.fn(() => ownedCanvas());
    const encode = vi.fn();
    const encoder = createGridPosterEncoder({ cloneCanvas, encode });

    encoder.capture(capture("current", 30));

    expect(cloneCanvas).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
  });
});

function capture(key: string, width = 10) {
  return {
    entry: {
      height: 10,
      mimeType: "image/webp",
      sourceKind: "image" as const,
      streamId: "stream-id",
      streamSourceName: "/camera",
      streamSourceNames: ["/camera"],
      width,
    },
    key,
    source: {} as HTMLCanvasElement,
  };
}

function ownedCanvas(): OffscreenCanvas {
  return { height: 10, width: 10 } as OffscreenCanvas;
}

function encodedBlob(bytes: readonly number[], type: string): Blob {
  const value = new Uint8Array(bytes);
  return {
    arrayBuffer: async () => value.buffer,
    size: value.byteLength,
    type,
  } as Blob;
}
