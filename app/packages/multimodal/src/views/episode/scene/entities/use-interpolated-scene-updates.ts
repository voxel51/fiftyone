import { useMemo } from "react";

import type { SceneUpdateVisualization } from "../../../../ir/index";
import type { DecodedFrame } from "../../../../ir/index";
import {
  isVisualizationCostObserved,
  recordVisualizationCost,
  visualizationCostNowMs,
} from "../../../../observability/visualization-cost";
import {
  interpolationFraction,
  nextDistinctCachedMessage,
  useStreamCacheSnapshot,
} from "../../playback/cache-sampling";
import {
  hasInterpolatableSceneEntityPair,
  interpolateSceneUpdate,
} from "./interpolate-scene-entities";
import { useDataStream } from "../../playback/data-stream-context";
import {
  useSceneUpdateHistoryContext,
  type SceneUpdateHistoryStream,
} from "./scene-update-history-context";
import {
  sceneUpdateSnapshotAt,
  type SceneUpdateDelta,
} from "./scene-update-state";
import type { EpisodeStreamCache } from "../../../../runtime/index";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";
import { useOptionalPlayhead } from "../../playback/use-optional-playhead";

/**
 * Layers smooth-mode interpolation over scene-annotation playback frames.
 * Each held frame is lerped toward the next distinct
 * cached message at the requested target time, producing a synthesized frame
 * stamped at that time so transform placement resolves with the geometry.
 * The 3D view defaults to the playhead; sensor projections can provide their
 * observation time explicitly. With interpolation disabled or when no
 * lookahead message is cached yet, recorded geometry is retained.
 *
 * The caller keeps ownership of stream subscriptions (they ride the base
 * `useStreamPlaybackFrames` call); this hook only reads caches.
 */
export function useInterpolatedSceneUpdateFrames({
  frames,
  interpolate,
  surface = "modal-3d",
  streams,
  targetTimeNs,
}: {
  readonly frames: readonly (StreamPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly interpolate: boolean;
  readonly surface?: "modal-3d" | "modal-image";
  readonly streams: readonly string[];
  readonly targetTimeNs?: bigint;
}): readonly (StreamPlaybackFrame<SceneUpdateVisualization> | null)[] {
  const dataStream = useDataStream();
  const history = useSceneUpdateHistoryContext();
  // Track every RAF tick only when there is annotation work to interpolate.
  // Otherwise, sample placement time only when the content-driven parent
  // renders, avoiding an empty high-frequency subscription.
  const tracksPlayhead =
    interpolate && streams.length > 0 && targetTimeNs === undefined;
  const playhead = useOptionalPlayhead(tracksPlayhead);
  const timeline = dataStream?.getTimelineIndex() ?? null;
  // Late-arriving lookahead messages must re-derive the lifecycle snapshot and
  // lerp even while the playhead is paused mid-gap.
  const cacheSnapshot = useStreamCacheSnapshot(dataStream, streams);

  const resolvedFrames = useMemo(() => {
    return frames.map((playbackFrame, index) => {
      const stream = streams[index];
      if (!playbackFrame || !stream) {
        return playbackFrame;
      }
      const placementTimeNs = targetTimeNs ?? playbackFrame.requestedTimeNs;
      const cache = dataStream?.getStreamCache(stream) ?? null;
      const historyStream = history.get(stream);
      const deltas = sceneUpdateDeltasForStream({
        cache,
        fallbackFrame: playbackFrame.frame,
        fallbackTimeNs: playbackFrame.contentTimeNs,
        historyDeltas: historyStream?.deltas,
        historyCoversTarget: sceneUpdateHistoryCovers(
          historyStream,
          placementTimeNs,
        ),
        targetTimeNs: placementTimeNs,
      });
      if (deltas.length === 0) {
        return playbackFrame;
      }

      return {
        ...playbackFrame,
        contentTimeNs:
          latestSceneUpdateTime(deltas, placementTimeNs) ??
          playbackFrame.contentTimeNs,
        frame: sceneUpdateSnapshotAt(deltas, placementTimeNs),
        requestedTimeNs: placementTimeNs,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheSnapshot is the caches' change digest
  }, [cacheSnapshot, dataStream, frames, history, streams, targetTimeNs]);

  return useMemo(() => {
    if (!interpolate || streams.length === 0 || !dataStream || !timeline) {
      return resolvedFrames;
    }

    const sampleTimeNs = targetTimeNs ?? timeline.secToNs(playhead);
    const currentTick =
      targetTimeNs === undefined
        ? timeline.nearestTick(playhead)
        : timeline.nearestTick(timeline.nsToSec(targetTimeNs));
    if (currentTick === undefined) {
      return resolvedFrames;
    }
    let changed = false;
    const interpolated = resolvedFrames.map((playbackFrame, index) => {
      const stream = streams[index];
      if (!playbackFrame || !stream) {
        return playbackFrame;
      }
      const cache = dataStream.getStreamCache(stream);
      if (!cache) {
        return playbackFrame;
      }

      const nextMsg = nextDistinctCachedMessage({
        cache,
        currentTick,
        currentTimelineTimeNs: playbackFrame.contentTimeNs,
        timeline,
      });
      if (!nextMsg) {
        return playbackFrame;
      }
      const nextViz = sceneUpdateOf(nextMsg);
      if (!nextViz) {
        return playbackFrame;
      }
      const interpolationGapNs =
        nextMsg.timestampNs - playbackFrame.contentTimeNs;
      if (
        interpolationGapNs <= 0n ||
        interpolationGapNs > cache.interpolationGapLimitNs()
      ) {
        return playbackFrame;
      }
      const historyStream = history.get(stream);
      const nextDeltas = sceneUpdateDeltasForStream({
        cache,
        fallbackFrame: nextViz,
        fallbackTimeNs: nextMsg.timestampNs,
        historyDeltas: historyStream?.deltas,
        historyCoversTarget: sceneUpdateHistoryCovers(
          historyStream,
          nextMsg.timestampNs,
        ),
        targetTimeNs: nextMsg.timestampNs,
      });
      const nextFrame =
        nextDeltas.length > 0
          ? sceneUpdateSnapshotAt(nextDeltas, nextMsg.timestampNs)
          : nextViz;
      if (!hasInterpolatableSceneEntityPair(playbackFrame.frame, nextFrame)) {
        return playbackFrame;
      }

      const f = interpolationFraction({
        nextTimelineTimeNs: nextMsg.timestampNs,
        playheadNs: sampleTimeNs,
        previousTimelineTimeNs: playbackFrame.contentTimeNs,
      });
      if (f === null) {
        return playbackFrame;
      }

      changed = true;
      return {
        ...playbackFrame,
        ageNs: 0n,
        contentTimeNs: sampleTimeNs,
        frame: interpolateSceneUpdate(
          playbackFrame.frame,
          nextFrame,
          f,
          sampleTimeNs,
        ),
        requestedTimeNs: sampleTimeNs,
      };
    });

    return changed ? interpolated : resolvedFrames;
  }, [
    dataStream,
    history,
    interpolate,
    playhead,
    resolvedFrames,
    surface,
    timeline,
    streams,
    targetTimeNs,
  ]);
}

function latestSceneUpdateTime(
  deltas: readonly SceneUpdateDelta[],
  targetTimeNs: bigint,
): bigint | null {
  let latest: bigint | null = null;
  for (const delta of deltas) {
    if (
      delta.timeNs <= targetTimeNs &&
      (latest === null || delta.timeNs > latest)
    ) {
      latest = delta.timeNs;
    }
  }
  return latest;
}

function sceneUpdateDeltasForStream({
  cache,
  fallbackFrame,
  fallbackTimeNs,
  historyDeltas,
  historyCoversTarget,
  targetTimeNs,
}: {
  readonly cache: EpisodeStreamCache | null;
  readonly fallbackFrame: SceneUpdateVisualization;
  readonly fallbackTimeNs: bigint;
  readonly historyDeltas: readonly SceneUpdateDelta[] | undefined;
  readonly historyCoversTarget: boolean;
  readonly targetTimeNs: bigint;
}): readonly SceneUpdateDelta[] {
  if (historyCoversTarget && historyDeltas) {
    return historyDeltas;
  }

  const cachedDeltas = cachedSceneUpdateDeltas(cache, targetTimeNs);
  if (cachedDeltas.length > 0) {
    return cachedDeltas;
  }

  return [{ timeNs: fallbackTimeNs, update: fallbackFrame }];
}

function sceneUpdateHistoryCovers(
  history: SceneUpdateHistoryStream | undefined,
  targetTimeNs: bigint,
): boolean {
  if (!history) return false;
  if (history.status === "ready") return true;
  return (
    history.loadedThroughNs !== undefined &&
    history.loadedThroughNs >= targetTimeNs
  );
}

function cachedSceneUpdateDeltas(
  cache: EpisodeStreamCache | null,
  targetTimeNs: bigint,
): readonly SceneUpdateDelta[] {
  if (!cache) {
    return [];
  }

  const deltas: SceneUpdateDelta[] = [];
  const seenMessages = new Set<string>();
  for (const tick of cache.cachedTicks()) {
    const msg = cache.get(tick);
    if (!msg || msg.timestampNs > targetTimeNs) {
      continue;
    }
    const update = sceneUpdateOf(msg);
    if (!update) {
      continue;
    }
    const key = `${msg.streamId}:${msg.sequence ?? ""}:${msg.timestampNs}`;
    if (seenMessages.has(key)) {
      continue;
    }
    seenMessages.add(key);
    deltas.push({ timeNs: msg.timestampNs, update });
  }
  return deltas;
}

function sceneUpdateOf(msg: DecodedFrame): SceneUpdateVisualization | null {
  const v = msg.output.visualization;
  if (!v || v.kind !== "scene-update") return null;
  return v as SceneUpdateVisualization;
}
