import {
  getBufferingDetail,
  getBufferingStreams,
  getIsBuffering,
  setIsBuffering,
  type PlaybackStore,
} from "@fiftyone/playback";
import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

import type { DecodedFrame } from "../../../ir";
import { createTimelineIndex, EpisodeStreamCache } from "../../../runtime";
import { VISUALIZATION_KIND } from "../../../visualization";
import {
  DEFAULT_PLAYBACK_POLICY,
  derivePlaybackPolicy,
} from "./playback-buffering";
import {
  getStreamContentTimeSec,
  getStreamStatus,
  publishDataStreamStatuses,
} from "./stream-status-state";

const CAMERA = "/camera";
const LIDAR = "/lidar";
const CAMERA_NAME = "/sensors/front_camera/image";
const LIDAR_NAME = "/sensors/roof_lidar/points";

describe("publishDataStreamStatuses", () => {
  it("publishes partial readiness and clears a covered paused-seek stall", () => {
    const store = createStore() as PlaybackStore;
    const camera = new EpisodeStreamCache();
    const lidar = new EpisodeStreamCache();
    camera.set(0n, frame(CAMERA));
    const caches = new Map([
      [CAMERA, camera],
      [LIDAR, lidar],
    ]);
    const onPlayheadDataReady = vi.fn();
    const scheduleBufferedRangesPublish = vi.fn();
    const common = {
      activeBlockingStreams: [CAMERA, LIDAR],
      activeStreams: [CAMERA, LIDAR],
      caches,
      failedStreams: new Set<string>(),
      index: createTimelineIndex({
        endNs: 1_000_000_000n,
        startNs: 0n,
      }),
      onPlayheadDataReady,
      policy: derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY),
      publishBufferedRangesNow: vi.fn(),
      pushCurrentTick: vi.fn(),
      resolveStartupCushion: () => ({
        cushionSeconds: 0.5,
        estimatedWaitSeconds: 0,
      }),
      scheduleBufferedRangesPublish,
      schedulePausedIdleWarmup: vi.fn(),
      staleWarningStreams: new Set([CAMERA]),
      store,
      streamNames: new Map([
        [CAMERA, CAMERA_NAME],
        [LIDAR, LIDAR_NAME],
      ]),
    } as const;

    publishDataStreamStatuses(common);
    expect(getStreamStatus(store, CAMERA)).toBe("ready");
    expect(getStreamContentTimeSec(store, CAMERA)).toBe(0);
    expect(getStreamStatus(store, LIDAR)).toBe("loading");
    expect(getBufferingDetail(store)).toBe("1/2 streams");
    expect(getBufferingStreams(store)).toEqual([
      { id: CAMERA, label: CAMERA_NAME, state: "ready" },
      { id: LIDAR, label: LIDAR_NAME, state: "waiting" },
    ]);
    expect(scheduleBufferedRangesPublish).toHaveBeenCalledOnce();
    expect(common.schedulePausedIdleWarmup).toHaveBeenCalledWith(
      common.policy.prefetchRefreshSeconds * 1000,
    );

    setIsBuffering(store, true);
    lidar.set(0n, null);
    publishDataStreamStatuses(common);
    expect(getStreamStatus(store, LIDAR)).toBe("gap");
    expect(getBufferingDetail(store)).toBeNull();
    expect(getBufferingStreams(store)).toEqual([]);
    expect(getIsBuffering(store)).toBe(false);
    expect(onPlayheadDataReady).toHaveBeenCalledOnce();
  });
  it("limits non-blocking settlements to their own stream state", () => {
    const store = createStore() as PlaybackStore;
    const camera = new EpisodeStreamCache();
    const lidar = new EpisodeStreamCache();
    camera.set(0n, frame(CAMERA));
    const common = {
      activeBlockingStreams: [CAMERA],
      activeStreams: [CAMERA, LIDAR],
      caches: new Map([
        [CAMERA, camera],
        [LIDAR, lidar],
      ]),
      failedStreams: new Set<string>(),
      index: createTimelineIndex({
        endNs: 1_000_000_000n,
        startNs: 0n,
      }),
      onPlayheadDataReady: vi.fn(),
      policy: derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY),
      publishBufferedRangesNow: vi.fn(),
      pushCurrentTick: vi.fn(),
      resolveStartupCushion: () => ({
        cushionSeconds: 0.5,
        estimatedWaitSeconds: 0,
      }),
      scheduleBufferedRangesPublish: vi.fn(),
      schedulePausedIdleWarmup: vi.fn(),
      staleWarningStreams: new Set<string>(),
      store,
      streamNames: new Map<string, string>(),
    } as const;

    publishDataStreamStatuses(common);
    vi.clearAllMocks();
    lidar.set(0n, frame(LIDAR));
    publishDataStreamStatuses({ ...common, updatedStreams: [LIDAR] });

    expect(getStreamStatus(store, LIDAR)).toBe("ready");
    expect(common.onPlayheadDataReady).not.toHaveBeenCalled();
    expect(common.publishBufferedRangesNow).not.toHaveBeenCalled();
    expect(common.scheduleBufferedRangesPublish).not.toHaveBeenCalled();
    expect(common.schedulePausedIdleWarmup).not.toHaveBeenCalled();
  });
});

function frame(streamId: string): DecodedFrame {
  return {
    output: {
      visualization: {
        bytes: new Uint8Array([1]),
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
      },
    },
    streamId,
    timestampNs: 0n,
  };
}
