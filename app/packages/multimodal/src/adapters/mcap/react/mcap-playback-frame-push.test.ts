import { isPlayPendingAtom } from "@fiftyone/playback/src/lib/playback/atoms";
import {
  getStreamValue,
  setIsBuffering,
} from "@fiftyone/playback/src/lib/playback/store-access";
import type { PlaybackStore } from "@fiftyone/playback/src/lib/playback/types";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapDecodedMessage } from "../types";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import { pushTickToStore } from "./mcap-playback-frame-push";
import { McapTopicCache } from "./mcap-topic-cache";
import { getMcapTopicDiagnostics } from "./mcap-stream-status-state";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

const TOPIC = "/LIDAR_TOP";
const NO_FAILED = new Set<string>();

function createHarness() {
  const store = createStore() as PlaybackStore;
  const cache = new McapTopicCache();
  const caches = new Map([[TOPIC, cache]]);
  const lastFrame = new Map<string, McapTopicPlaybackFrame<unknown>>();
  const push = (tick: bigint, failedTopics: ReadonlySet<string> = NO_FAILED) =>
    pushTickToStore([TOPIC], tick, caches, lastFrame, store, failedTopics);
  return { cache, lastFrame, push, store };
}

function message(timeNs: bigint): McapDecodedMessage {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    channelId: 1,
    decoded: {
      decoderId: "test-decoder",
      decoderVersion: "1",
      output: {
        visualization: {
          bytes: new Uint8Array([1]),
          kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        },
      },
      payload: { encoding: "test", schema: "test", schemaEncoding: "test" },
    },
    logTimeNs: timeNs,
    publishTimeNs: timeNs,
    sequence: 1,
    timelineTimeNs: timeNs,
    topic: TOPIC,
  };
}

function frameAt(store: PlaybackStore) {
  return getStreamValue<McapTopicPlaybackFrame<unknown> | null>(store, TOPIC);
}

describe("pushTickToStore", () => {
  it("clears the topic at a fetched-empty tick during normal playback", () => {
    const { cache, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);
    expect(frameAt(store)).not.toBeNull();

    // As-recorded honesty: a real content gap reached while playing
    // normally blanks the topic.
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

  it("holds the last frame across failure-sealed ticks of a failed topic", () => {
    const { cache, push, store } = createHarness();
    cache.set(0n, message(0n));
    push(0n);
    const held = frameAt(store);

    // Sealed "fetched, no message" ticks let the clock advance past a
    // persistently failing topic — the tile keeps its last real frame.
    cache.set(1n, null);
    push(1n, new Set([TOPIC]));
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
      decoded: {
        ...unavailable.decoded,
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
      },
    });

    push(0n);

    expect(frameAt(store)).toBeNull();
    expect(getMcapTopicDiagnostics(store, TOPIC)).toEqual([
      expect.objectContaining({ code: "camera-calibration-unavailable" }),
    ]);

    cache.set(1n, message(1n));
    push(1n);
    expect(getMcapTopicDiagnostics(store, TOPIC)).toEqual([]);
  });
});
