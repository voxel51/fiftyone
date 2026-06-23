import {
  useActiveSampleId,
  useAnnotationEngine,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { useCallback } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { useVideoPropagate } from "./useVideoPropagate";

/** Inclusive `[fromFrame, toFrame]` segment to re-propagate. */
export type FrameRange = [number, number];

/**
 * Given the current set of keyframe frames on a track and the frame where a
 * keyframe just changed, return the `(from, to)` pairs whose in-between frames
 * need re-propagation.
 *
 * - `kind: "set"` — `frame` is now a keyframe. Re-propagate both sides:
 *   (prev-keyframe, frame) and (frame, next-keyframe). Each side is skipped if
 *   no bracketing keyframe exists on that side.
 * - `kind: "removed"` — `frame` is no longer a keyframe. Re-propagate the wider
 *   span (prev-keyframe, next-keyframe). Skipped entirely if either bracketing
 *   keyframe is missing.
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
    if (prev !== null) {
      segments.push([prev, changedFrame]);
    }

    if (next !== null) {
      segments.push([changedFrame, next]);
    }
  } else if (prev !== null && next !== null) {
    segments.push([prev, next]);
  }

  return segments;
}

/**
 * Subscribe to `annotation:keyframeChanged` and re-propagate (linear) each
 * in-between segment that needs re-lerping against the new keyframe layout.
 *
 * Keyframe frames are read from the engine, so the layout reflects the edit
 * that just fired the event. Mount once inside the surface; a no-op until a
 * stream is published
 * (it supplies the field path / frame count) and an instance is identified.
 */
export const useAutoInterpolate = (): void => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const propagate = useVideoPropagate();

  useAnnotationEventHandler(
    "annotation:keyframeChanged",
    useCallback(
      (payload) => {
        if (!stream) {
          return;
        }

        const { instanceId, frame, kind } = payload;

        if (!instanceId) {
          return;
        }

        const path = `frames.${stream.labelsField}`;
        const keyframeFrames: number[] = [];

        for (let f = 1; f <= stream.totalFrames; f++) {
          const det = engine.getLabel({
            sample: sampleId,
            path,
            instanceId,
            frame: f,
          });

          if (det?.keyframe) {
            keyframeFrames.push(f);
          }
        }

        const segments = resolveSegmentsToRepropagate(
          keyframeFrames,
          frame,
          kind
        );

        segments.forEach(([from, to]) => {
          void propagate(instanceId, from, to, "linear");
        });
      },
      [engine, sampleId, stream, propagate]
    )
  );
};
