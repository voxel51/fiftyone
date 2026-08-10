import { usePlayback } from "@fiftyone/playback/runtime";
import { usePlaybackStore } from "@fiftyone/playback/runtime";
import {
  bumpStreamRangesVersion,
  getBufferingDetail,
  getIsPlaying,
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
import {
  isEpisodeBufferCostObserved,
  recordEpisodeBufferCost,
} from "../../../../observability/episode-buffer-cost";
import type { EpisodeFrameTransformTimeRange } from "../../../../runtime/frame-transform-types";
import type { TimelineIndex } from "../../../../runtime/index";
import { monotonicNowMs } from "../../../../utils/monotonic-time";
import type {
  FramePlacementReadiness,
  FrameTransformsState,
} from "../../spatial/frame-transforms/use-frame-transforms";
import { useDataStream } from "../../playback/data-stream-context";
import { MAX_STARTUP_CUSHION_WAIT_SECONDS } from "../../playback/startup-cushion";

const PLACEMENT_LOOKAHEAD_SECONDS = 1;
const PLACEMENT_STARTUP_BUFFER_SECONDS = 0.5;
export const SCENE_3D_PLACEMENT_BUFFERING_DETAIL = "placement transforms";

export function useScene3dPlacementStream({
  active,
  frameIds,
  frameTransforms,
  playbackTimeNs,
  streamId,
  worldFrameId,
}: {
  readonly active: boolean;
  readonly frameIds: readonly string[];
  readonly frameTransforms: FrameTransformsState;
  readonly playbackTimeNs?: bigint;
  readonly streamId: string;
  readonly worldFrameId: string;
}): FramePlacementReadiness {
  const dataStream = useDataStream();
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
  const frameIdsKey = frameIds.join("\0");
  const startupCoverageReady = placementStartupCoverageReady({
    frameTransforms,
    playbackTimeNs,
    readiness,
    timeline,
  });

  // Persistent registration lets the transform hook scope automatic seek
  // reads without starving consumers that do not own a placement stream.
  useEffect(() => {
    if (!active || !worldFrameId) return undefined;
    return frameTransforms.registerPlacementScope?.({
      frameIds,
      targetFrameId: worldFrameId,
    });
    // `frameIdsKey` carries the structural dependency without making callers
    // memoize the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    frameIdsKey,
    frameTransforms.registerPlacementScope,
    worldFrameId,
  ]);

  // This effect invalidates playback's buffered-range snapshot when transform
  // coverage or placement readiness changes.
  useEffect(() => {
    bumpStreamRangesVersion(store);
  }, [indexedRangeKey, readinessKey, store]);

  // This effect exposes placement work as playback buffering while a requested
  // play transition is waiting on transforms.
  useEffect(() => {
    const shouldPublish =
      playPending &&
      active &&
      (readiness.status === "loading" ||
        readiness.status === "needsFetch" ||
        (readiness.status === "ready" && !startupCoverageReady));
    const next = shouldPublish ? SCENE_3D_PLACEMENT_BUFFERING_DETAIL : null;
    const current = getBufferingDetail(store);
    if (next) {
      if (current !== next) {
        setBufferingDetail(store, next);
      }
      return;
    }
    if (current === SCENE_3D_PLACEMENT_BUFFERING_DETAIL) {
      setBufferingDetail(store, null);
    }
  }, [active, playPending, readiness.status, startupCoverageReady, store]);

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
      startupBufferMaxWaitSeconds: MAX_STARTUP_CUSHION_WAIT_SECONDS,
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
        const { frameIds: currentFrameIds, worldFrameId: currentWorldFrameId } =
          refs.current;
        currentTransforms.prefetchPlacement(tick, {
          frameIds: currentFrameIds,
          targetFrameId: currentWorldFrameId,
        });
      },
    }),
    [active, streamId, store, timeline?.stepNs],
  );
  usePlaybackStream(stream);

  // This effect keeps the selected placement stream subscribed for the hook's
  // lifetime and releases it when the selection changes.
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
    readonly frameTransforms: FrameTransformsState;
    readonly timeline: TimelineIndex | null;
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
    readonly frameTransforms: FrameTransformsState;
    readonly timeline: TimelineIndex | null;
    readonly worldFrameId: string;
  },
  store: PlaybackStore,
): Array<[number, number]> {
  if (!active || !timeline || frameIds.length === 0 || !worldFrameId) {
    return fullTimelineRange(timeline);
  }
  const tick = timeline.nearestTick(getPlayhead(store));
  const indexedRanges = frameTransforms.indexedDynamicRanges();
  if (tick !== undefined) {
    const readiness = frameTransforms.getPlacementReadiness({
      frameIds,
      targetFrameId: worldFrameId,
      timeNs: tick,
    });
    // A held pose is a resolved placement, not a buffering condition. Once
    // the current scene can be placed (or is definitively unplaceable), keep
    // playback continuous while transform runway reads catch up.
    if (readiness.status === "definitiveMissing") {
      return fullTimelineRange(timeline);
    }
    if (
      readiness.status === "ready" &&
      (getIsPlaying(store) || indexedRanges.length === 0)
    ) {
      return fullTimelineRange(timeline);
    }
  }
  if (indexedRanges.length === 0) {
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

function placementStartupCoverageReady({
  frameTransforms,
  playbackTimeNs,
  readiness,
  timeline,
}: {
  readonly frameTransforms: FrameTransformsState;
  readonly playbackTimeNs?: bigint;
  readonly readiness: FramePlacementReadiness;
  readonly timeline: TimelineIndex | null;
}): boolean {
  if (
    readiness.status === "definitiveMissing" ||
    !timeline ||
    playbackTimeNs === undefined
  ) {
    return true;
  }
  const ranges = frameTransforms.indexedDynamicRanges();
  if (readiness.status === "ready" && ranges.length === 0) {
    return true;
  }
  const startupEndTimeNs = timeline.secToNs(
    Math.min(
      timeline.durationSec,
      timeline.nsToSec(playbackTimeNs) + PLACEMENT_STARTUP_BUFFER_SECONDS,
    ),
  );
  return ranges.some(
    (range) =>
      range.startTimeNs <= playbackTimeNs &&
      startupEndTimeNs <= range.endTimeNs,
  );
}

function fullTimelineRange(
  timeline: TimelineIndex | null,
): Array<[number, number]> {
  return timeline ? [[0, timeline.durationSec]] : [];
}

function transformRangeToSeconds(
  timeline: TimelineIndex,
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
