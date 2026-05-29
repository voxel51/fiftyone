import { useCommandBus } from "@fiftyone/command-bus";
import {
  useFrameLabelsStream,
  type VideoFrameLabelsStream,
} from "@fiftyone/video-annotation";
import { useCallback } from "react";
import { PropagateCommand } from "../commands";
import { useAnnotationEventHandler } from "./useAnnotationEventHandler";

/** Inclusive `[fromFrame, toFrame]` segment to re-propagate. */
export type FrameRange = [number, number];

/**
 * Frame numbers on a track that carry `keyframe: true`. Walks the
 * stream cache once per call; the caller decides when to invoke (e.g.
 * on each `annotation:keyframeChanged` event).
 */
export function collectKeyframeFrames(
  stream: VideoFrameLabelsStream,
  trackId: string
): number[] {
  const allFrames = Array.from(
    { length: stream.totalFrames },
    (_, i) => i + 1
  );
  return allFrames.filter((frame) => {
    const snapshot = stream.getValue((frame - 1) / stream.fps);
    return (
      snapshot?.detections.some((d) => d.id === trackId && d.keyframe) ?? false
    );
  });
}

/**
 * Given the current set of keyframe frames on a track and the frame
 * where a keyframe just changed, return the `(from, to)` pairs whose
 * in-between frames need re-propagation.
 *
 * - `kind: "set"` — `frame` is now a keyframe. Re-propagate both
 *   sides: (prev-keyframe, frame) and (frame, next-keyframe). Each
 *   side is skipped if no bracketing keyframe exists on that side.
 * - `kind: "removed"` — `frame` is no longer a keyframe. Re-propagate
 *   the wider span (prev-keyframe, next-keyframe). Skipped entirely
 *   if either bracketing keyframe is missing.
 */
export function resolveSegmentsToRepropagate(
  keyframeFrames: number[],
  changedFrame: number,
  kind: "set" | "removed"
): FrameRange[] {
  const sorted = [...keyframeFrames].sort((a, b) => a - b);
  const prev = sorted.filter((f) => f < changedFrame).at(-1) ?? null;
  const next = sorted.find((f) => f > changedFrame) ?? null;

  const segments: FrameRange[] = [];

  if (kind === "set") {
    if (prev !== null) segments.push([prev, changedFrame]);
    if (next !== null) segments.push([changedFrame, next]);
  } else if (prev !== null && next !== null) {
    segments.push([prev, next]);
  }

  return segments;
}

/**
 * Subscribe to `annotation:keyframeChanged` and dispatch
 * `PropagateCommand` for each in-between segment that needs to be
 * re-lerped against the new keyframe layout.
 *
 * Mount once inside the video annotation surface alongside the other
 * video-annotation registrars. The hook is a no-op until a stream
 * is published.
 */
export const useAutoInterpolate = (): void => {
  const stream = useFrameLabelsStream();
  const bus = useCommandBus();

  useAnnotationEventHandler(
    "annotation:keyframeChanged",
    useCallback(
      (payload) => {
        if (!stream) return;
        const { instanceId, trackId, frame, kind } = payload;
        if (!instanceId) return;

        const keyframeFrames = collectKeyframeFrames(stream, trackId);
        const segments = resolveSegmentsToRepropagate(
          keyframeFrames,
          frame,
          kind
        );

        segments.forEach(([from, to]) => {
          void bus.execute(
            new PropagateCommand(instanceId, from, to, "linear")
          );
        });
      },
      [stream, bus]
    )
  );
};
