import { usePlayhead } from "@fiftyone/playback";
import { useMemo } from "react";

import type { SceneUpdateVisualization } from "../../../decoders";
import type { McapDecodedMessage } from "../types";
import { interpolationFraction } from "./interpolate-image-annotations";
import { interpolateSceneUpdate } from "./interpolate-scene-entities";
import { useMcapDataStream } from "./mcap-data-stream-context";
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
  // Re-render every RAF tick so the lerp tracks the playhead.
  const playhead = usePlayhead();
  const timeline = dataStream?.getTimelineIndex() ?? null;
  // Late-arriving lookahead messages must re-derive the lerp even while the
  // playhead is paused mid-gap.
  const cacheSnapshot = useTopicCacheSnapshot(
    interpolate ? dataStream : null,
    topics,
  );

  return useMemo(() => {
    if (!interpolate || !dataStream || !timeline) {
      return frames;
    }

    const currentTick = timeline.nearestTick(playhead);
    if (currentTick === undefined) {
      return frames;
    }
    const playheadNs = timeline.secToNs(playhead);

    let changed = false;
    const interpolated = frames.map((playbackFrame, index) => {
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
          nextViz,
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
    interpolate,
    playhead,
    timeline,
    topics,
  ]);
}

function sceneUpdateOf(
  msg: McapDecodedMessage,
): SceneUpdateVisualization | null {
  const v = msg.decoded.output.visualization;
  if (!v || v.kind !== "scene-update") return null;
  return v as SceneUpdateVisualization;
}
