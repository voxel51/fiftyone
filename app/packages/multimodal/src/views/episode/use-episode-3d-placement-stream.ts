import { usePlayback } from "@fiftyone/playback/runtime";
import { usePlaybackStore } from "@fiftyone/playback/runtime";
import {
  bumpStreamRangesVersion,
  getBufferingDetail,
  getPlayhead,
  setBufferingDetail,
} from "@fiftyone/playback/runtime";
import type {
  BufferReadiness,
  PlaybackStore,
  PlaybackStream,
} from "@fiftyone/playback/runtime";
import { useIsPlayPending } from "@fiftyone/playback/runtime";
import { usePlaybackStream } from "@fiftyone/playback/runtime";
import { useEffect, useMemo, useRef } from "react";
import type { EpisodeFrameTransformTimeRange } from "../../runtime/frame-transform-types";
import type {
  EpisodeFramePlacementReadiness,
  EpisodeFrameTransformsState,
} from "./use-episode-frame-transforms";
import { useEpisodeDataStream } from "./episode-data-stream-context";
import type { EpisodeTimelineIndex } from "./episode-timeline-index";

const PLACEMENT_LOOKAHEAD_SECONDS = 1;
const PLACEMENT_STARTUP_BUFFER_SECONDS = 0.5;
export const EPISODE_3D_PLACEMENT_BUFFERING_DETAIL = "placement transforms";

export function useEpisode3dPlacementStream({
  active,
  frameIds,
  frameTransforms,
  playbackTimeNs,
  streamId,
  worldFrameId,
}: {
  readonly active: boolean;
  readonly frameIds: readonly string[];
  readonly frameTransforms: EpisodeFrameTransformsState;
  readonly playbackTimeNs?: bigint;
  readonly streamId: string;
  readonly worldFrameId: string;
}): EpisodeFramePlacementReadiness {
  const dataStream = useEpisodeDataStream();
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
    const next = shouldPublish ? EPISODE_3D_PLACEMENT_BUFFERING_DETAIL : null;
    const current = getBufferingDetail(store);
    if (next) {
      if (current !== next) {
        setBufferingDetail(store, next);
      }
      return;
    }
    if (current === EPISODE_3D_PLACEMENT_BUFFERING_DETAIL) {
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
    readonly frameTransforms: EpisodeFrameTransformsState;
    readonly timeline: EpisodeTimelineIndex | null;
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
    readonly frameTransforms: EpisodeFrameTransformsState;
    readonly timeline: EpisodeTimelineIndex | null;
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
  timeline: EpisodeTimelineIndex | null,
): Array<[number, number]> {
  return timeline ? [[0, timeline.durationSec]] : [];
}

function transformRangeToSeconds(
  timeline: EpisodeTimelineIndex,
  range: EpisodeFrameTransformTimeRange,
): [number, number] {
  return [
    Math.max(0, timeline.nsToSec(range.startTimeNs)),
    Math.min(timeline.durationSec, timeline.nsToSec(range.endTimeNs)),
  ];
}

function frameTransformRangeKey(range: EpisodeFrameTransformTimeRange): string {
  return `${range.startTimeNs}:${range.endTimeNs}`;
}
