import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWarmupThenSeek } from "./useWarmupThenSeek";

const playback = vi.hoisted(() => ({
  seek: vi.fn(),
  store: {},
  playhead: 0,
  playing: false,
  pending: false,
  event: null as { seq: number; time: number } | null,
}));
vi.mock("@fiftyone/playback", () => ({
  usePlayback: () => ({ seek: playback.seek }),
  usePlaybackStore: () => playback.store,
  useSeekEvent: () => playback.event,
  getPlayhead: () => playback.playhead,
  getIsPlaying: () => playback.playing,
  getIsPlayPending: () => playback.pending,
}));
beforeEach(() => {
  playback.seek.mockReset();
  playback.playhead = 0;
  playback.playing = false;
  playback.pending = false;
  playback.event = null;
});
afterEach(cleanup);

it("waits for saved ranges, then warms and seeks their opening position", async () => {
  const stream = { warmup: vi.fn(async () => undefined) };
  const { rerender } = renderHook(
    ({ time }) => useWarmupThenSeek(stream, time),
    { initialProps: { time: null as number | null } },
  );
  expect(stream.warmup).not.toHaveBeenCalled();
  await act(async () => rerender({ time: 2 }));
  expect(stream.warmup).toHaveBeenCalledWith(2);
  expect(playback.seek).toHaveBeenCalledWith(2);
});

it.each(["scrub", "play", "queued play"])(
  "does not undo %s while the opening range warms",
  async (action) => {
    let finish!: () => void;
    const stream = {
      warmup: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    };
    const { rerender } = renderHook(() => useWarmupThenSeek(stream, 2));
    if (action === "scrub") playback.event = { seq: 1, time: 0 };
    if (action === "play") playback.playing = true;
    if (action === "queued play") playback.pending = true;
    rerender();
    await act(async () => finish());
    expect(playback.seek).not.toHaveBeenCalled();
  },
);

it("preserves the default annotation label-paint kick", async () => {
  playback.event = { seq: 1, time: 0 };
  const stream = { warmup: vi.fn(async () => undefined) };
  renderHook(() => useWarmupThenSeek(stream));
  await act(async () => undefined);
  expect(stream.warmup).toHaveBeenCalledWith(0);
  expect(playback.seek).toHaveBeenCalledWith(0);
});

it.each(["scrub", "play", "queued play"])(
  "does not undo %s while the default annotation warmup completes",
  async (action) => {
    let finish!: () => void;
    const stream = {
      warmup: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    };
    renderHook(() => useWarmupThenSeek(stream));
    if (action === "scrub") playback.playhead = 3;
    if (action === "play") playback.playing = true;
    if (action === "queued play") playback.pending = true;
    await act(async () => finish());
    expect(playback.seek).not.toHaveBeenCalled();
  },
);
