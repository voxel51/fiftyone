import { usePlayhead } from "@fiftyone/playback";
import { useMemo } from "react";

import type { SceneUpdateVisualization } from "../../../decoders";
import type { McapDecodedMessage } from "../types";
import { interpolationFraction } from "./interpolate-image-annotations";
import { interpolateSceneUpdate } from "./interpolate-scene-entities";
import { useMcapDataStream } from "./mcap-data-stream-context";
import { useMcapSceneUpdateHistoryContext } from "./mcap-scene-update-history-context";
import {
  sceneUpdateSnapshotAt,
  type McapSceneUpdateDelta,
} from "./mcap-scene-update-state";
import type { McapTopicCache } from "./mcap-topic-cache";
import {
  nextDistinctCachedMessage,
  useTopicCacheSnapshot,
} from "./use-interpolated-image-annotations";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

/**
 * Layers smooth-mode interpolation over the 3D tile's scene-annotation
 * playback frames. Each held frame is lerped toward the next distinct
 * cached message by the playhead fraction, producing a synthesized frame
 * stamped at the playhead so transform placement resolves at the same time
 * as the geometry. With `interpolate` false (as-recorded fidelity) or when
 * no lookahead message is cached yet, the input frames pass through
 * untouched.
 *
 * The caller keeps ownership of topic subscriptions (they ride the base
 * `useMcapTopicPlaybackFrames` call); this hook only reads caches.
 */
export function useInterpolatedSceneUpdateFrames({
  frames,
  interpolate,
  topics,
}: {
  readonly frames: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly interpolate: boolean;
  readonly topics: readonly string[];
}): readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[] {
  const dataStream = useMcapDataStream();
  const history = useMcapSceneUpdateHistoryContext();
  // Re-render every RAF tick so the lerp tracks the playhead.
  const playhead = usePlayhead();
  const timeline = dataStream?.getTimelineIndex() ?? null;
  // Late-arriving lookahead messages must re-derive the lifecycle snapshot and
  // lerp even while the playhead is paused mid-gap.
  const cacheSnapshot = useTopicCacheSnapshot(dataStream, topics);

  return useMemo(() => {
    const resolvedFrames = frames.map((playbackFrame, index) => {
      const topic = topics[index];
      if (!playbackFrame || !topic) {
        return playbackFrame;
      }
      const cache = dataStream?.getTopicCache(topic) ?? null;
      const deltas = sceneUpdateDeltasForTopic({
        cache,
        fallbackFrame: playbackFrame.frame,
        fallbackTimeNs: playbackFrame.contentTimeNs,
        historyDeltas: history.get(topic)?.deltas,
        historyReady: history.get(topic)?.status === "ready",
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
      const topic = topics[index];
      if (!playbackFrame || !topic) {
        return playbackFrame;
      }
      const cache = dataStream.getTopicCache(topic);
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
      const nextDeltas = sceneUpdateDeltasForTopic({
        cache,
        fallbackFrame: nextViz,
        fallbackTimeNs: nextMsg.timelineTimeNs,
        historyDeltas: history.get(topic)?.deltas,
        historyReady: history.get(topic)?.status === "ready",
        targetTimeNs: nextMsg.timelineTimeNs,
      });
      const nextFrame =
        nextDeltas.length > 0
          ? sceneUpdateSnapshotAt(nextDeltas, nextMsg.timelineTimeNs)
          : nextViz;

      const f = interpolationFraction({
        nextTimelineTimeNs: nextMsg.timelineTimeNs,
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

    return changed ? interpolated : frames;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheSnapshot is the caches' change digest
  }, [
    cacheSnapshot,
    dataStream,
    frames,
    history,
    interpolate,
    playhead,
    timeline,
    topics,
  ]);
}

function sceneUpdateDeltasForTopic({
  cache,
  fallbackFrame,
  fallbackTimeNs,
  historyDeltas,
  historyReady,
  targetTimeNs,
}: {
  readonly cache: McapTopicCache | null;
  readonly fallbackFrame: SceneUpdateVisualization;
  readonly fallbackTimeNs: bigint;
  readonly historyDeltas: readonly McapSceneUpdateDelta[] | undefined;
  readonly historyReady: boolean;
  readonly targetTimeNs: bigint;
}): readonly McapSceneUpdateDelta[] {
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
  cache: McapTopicCache | null,
  targetTimeNs: bigint,
): readonly McapSceneUpdateDelta[] {
  if (!cache) {
    return [];
  }

  const deltas: McapSceneUpdateDelta[] = [];
  const seenMessages = new Set<string>();
  for (const tick of cache.cachedTicks()) {
    const msg = cache.get(tick);
    if (!msg || msg.timelineTimeNs > targetTimeNs) {
      continue;
    }
    const update = sceneUpdateOf(msg);
    if (!update) {
      continue;
    }
    const key = `${msg.channelId}:${msg.sequence}:${msg.timelineTimeNs}`;
    if (seenMessages.has(key)) {
      continue;
    }
    seenMessages.add(key);
    deltas.push({ timeNs: msg.timelineTimeNs, update });
  }
  return deltas;
}

function sceneUpdateOf(
  msg: McapDecodedMessage,
): SceneUpdateVisualization | null {
  const v = msg.decoded.output.visualization;
  if (!v || v.kind !== "scene-update") return null;
  return v as SceneUpdateVisualization;
}
