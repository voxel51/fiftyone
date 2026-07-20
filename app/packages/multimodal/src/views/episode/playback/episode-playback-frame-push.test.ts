import { isPlayPendingAtom } from "@fiftyone/playback/runtime";
import { getStreamValue, setIsBuffering } from "@fiftyone/playback/runtime";
import type { PlaybackStore } from "@fiftyone/playback/runtime";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { DecodedFrame } from "../../../ir";
import { pushTickToStore } from "./episode-playback-frame-push";
import { EpisodeStreamCache } from "./episode-stream-cache";
import { getEpisodeStreamDiagnostics } from "./episode-stream-status-state";
import type { EpisodeStreamPlaybackFrame } from "./use-episode-stream-values";

const STREAM = "/LIDAR_TOP";
const NO_FAILED = new Set<string>();

function createHarness() {
  const store = createStore() as PlaybackStore;
  const cache = new EpisodeStreamCache();
  const caches = new Map([[STREAM, cache]]);
  const lastFrame = new Map<string, EpisodeStreamPlaybackFrame<unknown>>();
  const push = (tick: bigint, failedStreams: ReadonlySet<string> = NO_FAILED) =>
    pushTickToStore([STREAM], tick, caches, lastFrame, store, failedStreams);
  return { cache, lastFrame, push, store };
}

function message(timeNs: bigint): DecodedFrame {
  return {
    output: {
      visualization: {
        bytes: new Uint8Array([1]),
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
      },
    },
    sequence: 1,
    streamId: STREAM,
    timestampNs: timeNs,
  };
}

function frameAt(store: PlaybackStore) {
  return getStreamValue<EpisodeStreamPlaybackFrame<unknown> | null>(
    store,
    STREAM,
  );
}

describe("pushTickToStore", () => {
  it("clears the stream at a fetched-empty tick during normal playback", () => {
    const { cache, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);
    expect(frameAt(store)).not.toBeNull();

    // As-recorded honesty: a real content gap reached while playing
    // normally blanks the stream.
    cache.set(1n, null);
    push(1n);
    expect(frameAt(store)).toBeNull();
  });

  it("holds the last frame at a fetched-empty tick while buffering", () => {
    const { cache, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);
    const held = frameAt(store);

    setIsBuffering(store, true);
    cache.set(1n, null);
    push(1n);
    expect(frameAt(store)).toBe(held);
  });

  it("holds the last frame at a fetched-empty tick while a play press is pending", () => {
    const { cache, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);
    const held = frameAt(store);

    store.set(isPlayPendingAtom, true);
    cache.set(1n, null);
    push(1n);
    expect(frameAt(store)).toBe(held);
  });

  it("holds the last frame across failure-sealed ticks of a failed stream", () => {
    const { cache, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);
    const held = frameAt(store);

    // Sealed "fetched, no message" ticks let the clock advance past a
    // persistently failing stream — the tile keeps its last real frame.
    cache.set(1n, null);
    push(1n, new Set([STREAM]));
    expect(frameAt(store)).toBe(held);
  });

  it("re-resolves a held frame to the honest gap once the stall clears", () => {
    const { cache, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);

    setIsBuffering(store, true);
    cache.set(1n, null);
    push(1n);
    expect(frameAt(store)).not.toBeNull();

    setIsBuffering(store, false);
    push(1n);
    expect(frameAt(store)).toBeNull();
  });

  it("keeps holding an unfetched tick regardless of stall state", () => {
    const { cache, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);
    const held = frameAt(store);

    // Not fetched yet (e.g. evicted under cache pressure while the clock
    // is frozen): the last frame stays either way.
    push(5n);
    expect(frameAt(store)).toBe(held);
  });

  it("cannot hold through a stall once held frames were cleared by a seek", () => {
    const { cache, lastFrame, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);

    // The seek path drops held frames before its first push.
    lastFrame.clear();
    setIsBuffering(store, true);
    cache.set(30n, null);
    push(30n);
    expect(frameAt(store)).toBeNull();
  });

  it("replaces a held frame the moment real data lands", () => {
    const { cache, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);

    setIsBuffering(store, true);
    cache.set(1n, null);
    push(1n);

    cache.set(1n, message(1n));
    push(1n);
    const frame = frameAt(store);
    expect(frame?.contentTimeNs).toBe(1n);
  });

  it("publishes capability diagnostics from attributes-only messages", () => {
    const { cache, push, store } = createHarness();
    const unavailable = message(0n);
    cache.set(0n, {
      ...unavailable,
      output: {
        diagnostics: [
          {
            capability: "camera-calibration",
            code: "camera-calibration-unavailable",
            message: "Camera calibration is unavailable",
            severity: "warning",
          },
        ],
      },
    });

    push(0n);

    expect(frameAt(store)).toBeNull();
    expect(getEpisodeStreamDiagnostics(store, STREAM)).toEqual([
      expect.objectContaining({ code: "camera-calibration-unavailable" }),
    ]);

    cache.set(1n, message(1n));
    push(1n);
    expect(getEpisodeStreamDiagnostics(store, STREAM)).toEqual([]);
  });
});
