import { usePlayback } from "@fiftyone/playback/src/lib/playback/PlaybackProvider";
import { usePlaybackStore } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import {
  bumpStreamRangesVersion,
  getBufferingDetail,
  getPlayhead,
  setBufferingDetail,
} from "@fiftyone/playback/src/lib/playback/store-access";
import type {
  BufferReadiness,
  PlaybackStore,
  PlaybackStream,
} from "@fiftyone/playback/src/lib/playback/types";
import { useIsPlayPending } from "@fiftyone/playback/src/lib/playback/use-playback-state";
import { usePlaybackStream } from "@fiftyone/playback/src/lib/playback/use-playback-stream";
import { useEffect, useMemo, useRef } from "react";
import type { McapFrameTransformTimeRange } from "../frame-transform-types";
import type {
  McapFramePlacementReadiness,
  McapFrameTransformsState,
} from "./use-mcap-frame-transforms";
import { useMcapDataStream } from "./mcap-data-stream-context";
import type { McapTimelineIndex } from "./mcap-timeline-index";

const PLACEMENT_LOOKAHEAD_SECONDS = 1;
const PLACEMENT_STARTUP_BUFFER_SECONDS = 0.5;
export const MCAP_3D_PLACEMENT_BUFFERING_DETAIL = "placement transforms";

export function useMcap3dPlacementStream({
  active,
  frameIds,
  frameTransforms,
  playbackTimeNs,
  streamId,
  worldFrameId,
}: {
  readonly active: boolean;
  readonly frameIds: readonly string[];
  readonly frameTransforms: McapFrameTransformsState;
  readonly playbackTimeNs?: bigint;
  readonly streamId: string;
  readonly worldFrameId: string;
}): McapFramePlacementReadiness {
  const dataStream = useMcapDataStream();
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const store = usePlaybackStore();
  const { subscribeStream } = usePlayback();
  const playPending = useIsPlayPending();
  const refs = useRef({
    active,
    frameIds,
    frameTransforms,
    timeline,
    worldFrameId,
  });
  refs.current = {
    active,
    frameIds,
    frameTransforms,
    timeline,
    worldFrameId,
  };

  const readiness = useMemo(
    () =>
      active
        ? frameTransforms.getPlacementReadiness({
            frameIds,
            targetFrameId: worldFrameId,
            timeNs: playbackTimeNs,
          })
        : { frameIds: [], status: "ready" as const },
    [active, frameIds, frameTransforms, playbackTimeNs, worldFrameId],
  );

  const indexedRangeKey = frameTransforms
    .indexedDynamicRanges()
    .map(frameTransformRangeKey)
    .join("|");
  const readinessKey = `${readiness.status}:${readiness.frameIds.join(",")}`;
  useEffect(() => {
    bumpStreamRangesVersion(store);
  }, [indexedRangeKey, readinessKey, store]);

  useEffect(() => {
    const shouldPublish =
      playPending &&
      active &&
      (readiness.status === "loading" || readiness.status === "needsFetch");
    const next = shouldPublish ? MCAP_3D_PLACEMENT_BUFFERING_DETAIL : null;
    const current = getBufferingDetail(store);
    if (next) {
      if (current !== next) {
        setBufferingDetail(store, next);
      }
      return;
    }
    if (current === MCAP_3D_PLACEMENT_BUFFERING_DETAIL) {
      setBufferingDetail(store, null);
    }
  }, [active, playPending, readiness.status, store]);

  const stream = useMemo<PlaybackStream>(
    () => ({
      id: streamId,
      blocking: active,
      lookaheadSeconds: PLACEMENT_LOOKAHEAD_SECONDS,
      nativeStepSeconds:
        timeline?.stepNs === undefined
          ? undefined
          : Number(timeline.stepNs) / 1_000_000_000,
      startupBufferSeconds: PLACEMENT_STARTUP_BUFFER_SECONDS,
      bufferState: (timeSec) => placementBufferState(refs.current, timeSec),
      bufferedRanges: () => placementBufferedRanges(refs.current, store),
      prefetch: ([startSec]) => {
        const {
          frameTransforms: currentTransforms,
          timeline: currentTimeline,
        } = refs.current;
        const tick = currentTimeline?.nearestTick(startSec);
        if (tick === undefined) {
          return;
        }
        currentTransforms.prefetchPlacement(tick);
      },
    }),
    [active, streamId, store, timeline?.stepNs],
  );
  usePlaybackStream(stream);

  useEffect(() => {
    if (!streamId) {
      return undefined;
    }
    return subscribeStream(streamId);
  }, [streamId, subscribeStream]);

  return readiness;
}

function placementBufferState(
  {
    active,
    frameIds,
    frameTransforms,
    timeline,
    worldFrameId,
  }: {
    readonly active: boolean;
    readonly frameIds: readonly string[];
    readonly frameTransforms: McapFrameTransformsState;
    readonly timeline: McapTimelineIndex | null;
    readonly worldFrameId: string;
  },
  timeSec: number,
): BufferReadiness {
  if (!active) {
    return "ready";
  }
  const tick = timeline?.nearestTick(timeSec);
  if (tick === undefined) {
    return "ready";
  }
  const readiness = frameTransforms.getPlacementReadiness({
    frameIds,
    targetFrameId: worldFrameId,
    timeNs: tick,
  });
  switch (readiness.status) {
    case "loading":
      return "loading";
    case "needsFetch":
      return "missing";
    default:
      return "ready";
  }
}

function placementBufferedRanges(
  {
    active,
    frameIds,
    frameTransforms,
    timeline,
    worldFrameId,
  }: {
    readonly active: boolean;
    readonly frameIds: readonly string[];
    readonly frameTransforms: McapFrameTransformsState;
    readonly timeline: McapTimelineIndex | null;
    readonly worldFrameId: string;
  },
  store: PlaybackStore,
): Array<[number, number]> {
  if (!active || !timeline || frameIds.length === 0 || !worldFrameId) {
    return fullTimelineRange(timeline);
  }
  const indexedRanges = frameTransforms.indexedDynamicRanges();
  if (indexedRanges.length === 0) {
    const tick = timeline.nearestTick(getPlayhead(store));
    if (tick === undefined) {
      return [];
    }
    const readiness = frameTransforms.getPlacementReadiness({
      frameIds,
      targetFrameId: worldFrameId,
      timeNs: tick,
    });
    return readiness.status === "ready" ||
      readiness.status === "definitiveMissing"
      ? fullTimelineRange(timeline)
      : [];
  }
  return indexedRanges.map((range) => transformRangeToSeconds(timeline, range));
}

function fullTimelineRange(
  timeline: McapTimelineIndex | null,
): Array<[number, number]> {
  return timeline ? [[0, timeline.durationSec]] : [];
}

function transformRangeToSeconds(
  timeline: McapTimelineIndex,
  range: McapFrameTransformTimeRange,
): [number, number] {
  return [
    Math.max(0, timeline.nsToSec(range.startTimeNs)),
    Math.min(timeline.durationSec, timeline.nsToSec(range.endTimeNs)),
  ];
}

function frameTransformRangeKey(range: McapFrameTransformTimeRange): string {
  return `${range.startTimeNs}:${range.endTimeNs}`;
}
