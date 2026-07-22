import { useMemo } from "react";

import type { SceneUpdateVisualization } from "../../../../ir/index";
import type { DecodedFrame } from "../../../../ir/index";
import {
  interpolationFraction,
  nextDistinctCachedMessage,
  useStreamCacheSnapshot,
} from "../../playback/cache-sampling";
import { interpolateSceneUpdate } from "./interpolate-scene-entities";
import { useDataStream } from "../../playback/data-stream-context";
import { useSceneUpdateHistoryContext } from "./scene-update-history-context";
import {
  sceneUpdateSnapshotAt,
  type SceneUpdateDelta,
} from "./scene-update-state";
import type { EpisodeStreamCache } from "../../../../runtime/index";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";
import { useOptionalPlayhead } from "../../playback/use-optional-playhead";

/**
 * Layers smooth-mode interpolation over the 3D tile's scene-annotation
 * playback frames. Each held frame is lerped toward the next distinct
 * cached message by the playhead fraction, producing a synthesized frame
 * stamped at the playhead so transform placement resolves at the same time
 * as the geometry. With `interpolate` false (as-recorded fidelity) or when
 * no lookahead message is cached yet, the input frames pass through
 * untouched.
 *
 * The caller keeps ownership of stream subscriptions (they ride the base
 * `useStreamPlaybackFrames` call); this hook only reads caches.
 */
export function useInterpolatedSceneUpdateFrames({
  frames,
  interpolate,
  streams,
}: {
  readonly frames: readonly (StreamPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly interpolate: boolean;
  readonly streams: readonly string[];
}): readonly (StreamPlaybackFrame<SceneUpdateVisualization> | null)[] {
  const dataStream = useDataStream();
  const history = useSceneUpdateHistoryContext();
  // Smooth mode tracks every RAF tick. As-recorded mode samples placement time
  // only when its content-driven parent renders, avoiding a broad 60 Hz root.
  const playhead = useOptionalPlayhead(interpolate);
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
      const cache = dataStream?.getStreamCache(stream) ?? null;
      const historyStream = history.get(stream);
      const deltas = sceneUpdateDeltasForStream({
        cache,
        fallbackFrame: playbackFrame.frame,
        fallbackTimeNs: playbackFrame.contentTimeNs,
        historyDeltas: historyStream?.deltas,
        historyReady: historyStream?.status === "ready",
        targetTimeNs: playbackFrame.requestedTimeNs,
      });
      if (deltas.length === 0) {
        return playbackFrame;
      }

      return {
        ...playbackFrame,
        frame: sceneUpdateSnapshotAt(deltas, playbackFrame.requestedTimeNs),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheSnapshot is the caches' change digest
  }, [cacheSnapshot, dataStream, frames, history, streams]);

  return useMemo(() => {
    if (!interpolate || !dataStream || !timeline) {
      return resolvedFrames;
    }

    const currentTick = timeline.nearestTick(playhead);
    if (currentTick === undefined) {
      return resolvedFrames;
    }
    const playheadNs = timeline.secToNs(playhead);

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
      const historyStream = history.get(stream);
      const nextDeltas = sceneUpdateDeltasForStream({
        cache,
        fallbackFrame: nextViz,
        fallbackTimeNs: nextMsg.timestampNs,
        historyDeltas: historyStream?.deltas,
        historyReady: historyStream?.status === "ready",
        targetTimeNs: nextMsg.timestampNs,
      });
      const nextFrame =
        nextDeltas.length > 0
          ? sceneUpdateSnapshotAt(nextDeltas, nextMsg.timestampNs)
          : nextViz;

      const f = interpolationFraction({
        nextTimelineTimeNs: nextMsg.timestampNs,
        playheadNs,
        previousTimelineTimeNs: playbackFrame.contentTimeNs,
      });
      if (f === null) {
        return playbackFrame;
      }

      changed = true;
      return {
        ...playbackFrame,
        ageNs: 0n,
        contentTimeNs: playheadNs,
        frame: interpolateSceneUpdate(
          playbackFrame.frame,
          nextFrame,
          f,
          playheadNs,
        ),
      };
    });

    return changed ? interpolated : resolvedFrames;
  }, [
    dataStream,
    history,
    interpolate,
    playhead,
    resolvedFrames,
    timeline,
    streams,
  ]);
}

function sceneUpdateDeltasForStream({
  cache,
  fallbackFrame,
  fallbackTimeNs,
  historyDeltas,
  historyReady,
  targetTimeNs,
}: {
  readonly cache: EpisodeStreamCache | null;
  readonly fallbackFrame: SceneUpdateVisualization;
  readonly fallbackTimeNs: bigint;
  readonly historyDeltas: readonly SceneUpdateDelta[] | undefined;
  readonly historyReady: boolean;
  readonly targetTimeNs: bigint;
}): readonly SceneUpdateDelta[] {
  if (historyReady && historyDeltas) {
    return historyDeltas;
  }

  const cachedDeltas = cachedSceneUpdateDeltas(cache, targetTimeNs);
  if (cachedDeltas.length > 0) {
    return cachedDeltas;
  }

  return [{ timeNs: fallbackTimeNs, update: fallbackFrame }];
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
