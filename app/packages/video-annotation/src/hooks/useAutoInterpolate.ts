import {
  useActiveSampleId,
  useAnnotationEngine,
  useAnnotationEventHandler,
  useSurfaceActions,
} from "@fiftyone/annotation";
import { useCallback, useMemo } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { useVideoLabelsIndex } from "./useVideoLabelsIndex";
import { useFrameLabelFields } from "../state/accessors";
import {
  readEngineOverlay,
  resolveInstanceFrameLayout,
} from "../tracks/frameTracks";
import { useVideoPropagate } from "./useVideoPropagate";

const SURFACE = "video";

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
  kind: "set" | "removed",
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
 * The keyframe/presence layout is read from the server index (`keyframes` is a
 * first-class field there) merged with the engine's edited-frame overlay, so
 * the layout reflects the edit that just fired the event WITHOUT walking the
 * clip. Only the affected span's box geometry is then fetched on demand — the
 * index carries no payloads. Mount once inside the surface; a no-op until a
 * stream is published (it supplies the field path) and an instance is
 * identified.
 */
export const useAutoInterpolate = (): void => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const propagate = useVideoPropagate();
  const actions = useSurfaceActions(engine, SURFACE);

  // The presence/keyframe baseline for every active frame field. `keyframes`
  // rides the index for free, so no dynamic-attribute projection is needed.
  const frameFields = useFrameLabelFields();
  const fields = useMemo(() => Object.keys(frameFields), [frameFields]);
  const { indexByPath } = useVideoLabelsIndex(stream, fields);

  useAnnotationEventHandler(
    "annotation:keyframeChanged",
    useCallback(
      async (payload) => {
        if (!stream) {
          return;
        }

        const { instanceId, frame, kind, undoKey } = payload;

        if (!instanceId) {
          return;
        }

        // re-lerp on the field the change happened on (a non-primary track,
        // e.g. a polyline, re-lerps in place); fall back to the primary field
        const path = payload.path ?? `frames.${stream.labelsField}`;

        // Keyframe + presence frames from the index baseline ⊕ the engine's
        // edited-frame overlay — the payload-free layout, no whole-clip walk.
        const { keyframeFrames, presentFrames } = resolveInstanceFrameLayout(
          indexByPath[path] ?? [],
          readEngineOverlay(engine, sampleId, path),
          instanceId,
        );

        const segments = resolveSegmentsToRepropagate(
          keyframeFrames,
          frame,
          kind,
        );

        // The tail step-hold (Case C below) walks the trailing filler when the
        // LAST keyframe is edited — empty otherwise. Computed up front so the
        // on-demand fetch covers it.
        const hasNextKeyframe = keyframeFrames.some((kf) => kf > frame);
        const tailFrames =
          kind === "set" && !hasNextKeyframe
            ? presentFrames.filter((f) => f > frame)
            : [];

        // Fetch only the affected span's box geometry: the segment endpoints the
        // re-lerp reads, the in-between filler it overwrites, and the tail filler
        // the step-hold rewrites. The index gave us the layout for free — the
        // boxes are the one thing it doesn't carry.
        let lo = frame;
        let hi = frame;
        for (const [from, to] of segments) {
          lo = Math.min(lo, from);
          hi = Math.max(hi, to);
        }

        if (tailFrames.length > 0) {
          hi = Math.max(hi, tailFrames[tailFrames.length - 1]);
        }

        await stream.fetchRange(lo, hi);

        // Re-lerp under the triggering edit's gesture key (when present) so
        // each segment coalesces into that edit's single undo unit, on the
        // changed label's own field.
        segments.forEach(([from, to]) => {
          void propagate(instanceId, from, to, "linear", undoKey, path);
        });

        // Case C — tail step-hold. Editing the LAST keyframe of a track has no
        // keyframe after it to lerp toward, so the forward re-lerp above is a
        // no-op for the trailing filler — yet a track can extend past its last
        // keyframe with `keyframe: false` filler (a track extend, or the
        // first-frame-only auto-keyframe asymmetry). Without this the filler
        // keeps its stale geometry and the user sees a jump at `frame + 1`.
        // Step-hold the edited keyframe's box forward over that filler,
        // coalesced into the edit's undo unit. Detections only — a keyframe is a
        // bbox concern (mirrors the guard in `useKeyframePromotionOnEdit`).
        if (tailFrames.length === 0) {
          return;
        }

        const anchor = engine.getLabel({
          sample: sampleId,
          path,
          instanceId,
          frame,
        });

        if (!anchor || !Array.isArray(anchor.bounding_box)) {
          return;
        }

        actions.transaction(
          () => {
            for (const tailFrame of tailFrames) {
              const existing = engine.getLabel({
                sample: sampleId,
                path,
                instanceId,
                frame: tailFrame,
              });

              // Only overwrite filler — never a real keyframe in the tail.
              if (!existing || existing.keyframe === true) {
                continue;
              }

              actions.updateLabel(
                { path, instanceId, frame: tailFrame },
                { bounding_box: anchor.bounding_box, keyframe: false },
              );
            }
          },
          undoKey ? { undoKey } : undefined,
        );
      },
      [engine, sampleId, stream, propagate, actions, indexByPath],
    ),
  );
};
