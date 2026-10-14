/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const seek = vi.fn();

vi.mock("@fiftyone/playback", () => ({
  usePlayback: () => ({ seek }),
}));

import { useWarmupThenSeek } from "./useWarmupThenSeek";

/** A stream whose warmup resolves when the test says so. */
const deferredStream = () => {
  let resolve: () => void = () => undefined;
  const warmup = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  return { stream: { warmup }, land: () => resolve() };
};

describe("useWarmupThenSeek", () => {
  it("warms up and seeks to a fixed time", async () => {
    seek.mockClear();
    const { stream, land } = deferredStream();

    renderHook(() => useWarmupThenSeek(stream, 4));
    land();
    await vi.waitFor(() => expect(seek).toHaveBeenCalled());

    expect(stream.warmup).toHaveBeenCalledWith(4);
    expect(seek).toHaveBeenCalledWith(4);
  });

  it("re-reads a getter when the warmup lands", async () => {
    seek.mockClear();
    const { stream, land } = deferredStream();
    let playhead = 10;
    const getPlayhead = () => playhead;

    renderHook(() => useWarmupThenSeek(stream, getPlayhead));
    // the clock keeps running while the chunk loads
    playhead = 10.4;
    land();
    await vi.waitFor(() => expect(seek).toHaveBeenCalled());

    expect(stream.warmup).toHaveBeenCalledWith(10);
    expect(seek).toHaveBeenCalledWith(10.4);
  });

  it("does not seek after unmounting", async () => {
    seek.mockClear();
    const { stream, land } = deferredStream();

    const { unmount } = renderHook(() => useWarmupThenSeek(stream, 2));
    unmount();
    land();
    await Promise.resolve();

    expect(seek).not.toHaveBeenCalled();
  });
});
