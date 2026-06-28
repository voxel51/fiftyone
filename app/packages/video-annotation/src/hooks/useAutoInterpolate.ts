import {
  useActiveSampleId,
  useAnnotationEngine,
  useAnnotationEventHandler,
  useSurfaceActions,
} from "@fiftyone/annotation";
import type { LabelData } from "@fiftyone/utilities";
import { useCallback, useEffect, useRef } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { useVideoPropagate } from "./useVideoPropagate";

const SURFACE = "video";

/**
 * Geometry-only subset copied during the "tail step-hold" pass. Whatever shape
 * fields the anchor label carries (bbox-only Detection, keypoints, both) are
 * forwarded as-is over the trailing non-keyframe filler — propagation
 * provenance, attributes, and identity stay on the existing frame.
 */
const pickGeometry = (label: LabelData): Partial<LabelData> => {
  const out: Partial<LabelData> = {};
  if (label.bounding_box !== undefined) {
    out.bounding_box = label.bounding_box;
  }
  if (label.points !== undefined) {
    out.points = label.points;
  }
  return out;
};

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

/** Payload shape of `annotation:keyframeChanged`, replicated locally. */
type KeyframeChangedPayload = {
  trackId: string;
  instanceId: string | null;
  frame: number;
  kind: "set" | "removed";
};

/**
 * Subscribe to `annotation:keyframeChanged` and re-propagate (linear) each
 * in-between segment that needs re-lerping against the new keyframe layout.
 *
 * Keyframe frames are read from the engine, so the layout reflects the edit
 * that just fired the event. Mount once inside the surface; a no-op until a
 * stream is published
 * (it supplies the field path / frame count) and an instance is identified.
 *
 * Coalescing: bursts of events for the same `(instanceId, frame, kind)` key
 * inside one microtask tick collapse to a single interp pass. A drag-resize
 * gesture that commits per-mousemove no longer fans out into N redundant
 * O(totalFrames) scans — each unique key runs once per tick.
 */
export const useAutoInterpolate = (): void => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const propagate = useVideoPropagate();
  const actions = useSurfaceActions(engine, SURFACE);

  // Per-hook-instance state: pending events keyed by
  // `${instanceId}:${frame}:${kind}` and a "microtask scheduled" flag. Kept in
  // refs (not module-level) so multiple mounts of this hook don't share state.
  const pendingRef = useRef<Map<string, KeyframeChangedPayload>>(new Map());
  const scheduledRef = useRef(false);
  // Drop pending drains after unmount — the microtask could outlive the hook.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingRef.current.clear();
      scheduledRef.current = false;
    };
  }, []);

  // The actual work, identical to the prior synchronous handler — runs once
  // per unique pending key during the microtask drain.
  const runInterp = useCallback(
    (payload: KeyframeChangedPayload) => {
      if (!stream) {
        return;
      }

      const { instanceId, frame, kind } = payload;

      if (!instanceId) {
        return;
      }

      const path = `frames.${stream.labelsField}`;
      const keyframeFrames: number[] = [];
      // All frames where this instance is present (keyframe OR filler). Used
      // by the tail step-hold below — see `runTailStepHold`.
      const presentFrames: number[] = [];

      for (let f = 1; f <= stream.totalFrames; f++) {
        const det = engine.getLabel({
          sample: sampleId,
          path,
          instanceId,
          frame: f,
        });

        if (!det) {
          continue;
        }
        presentFrames.push(f);
        if (det.keyframe) {
          keyframeFrames.push(f);
        }
      }

      const segments = resolveSegmentsToRepropagate(
        keyframeFrames,
        frame,
        kind,
      );

      segments.forEach(([from, to]) => {
        void propagate(instanceId, from, to, "linear");
      });

      // Case C — tail step-hold.
      //
      // Only applies on `"set"` (an edit that promotes/refreshes a keyframe).
      // When no keyframe exists strictly after `frame`, the forward bracketing
      // interp in `resolveSegmentsToRepropagate` is a no-op — but the track
      // can still extend past this keyframe with non-keyframe filler (the
      // first-frame-auto-keyframed / last-frame-not asymmetry). Without this
      // pass, filler at `frame+1 ... last` keeps its old geometry and the
      // user sees a visible jump at `frame+1`.
      //
      // Walk the trailing non-keyframe filler and overwrite geometry only;
      // `keyframe: false` stays put so future bracketing interps still treat
      // these frames as filler.
      if (kind === "set") {
        const hasNextKeyframe = keyframeFrames.some((kf) => kf > frame);

        if (!hasNextKeyframe) {
          const anchor = engine.getLabel({
            sample: sampleId,
            path,
            instanceId,
            frame,
          });

          if (anchor) {
            const tailFrames = presentFrames.filter((f) => f > frame);
            const geometry = pickGeometry(anchor);
            const hasGeometry = Object.keys(geometry).length > 0;

            if (tailFrames.length > 0 && hasGeometry) {
              actions.transaction(() => {
                for (const f of tailFrames) {
                  const existing = engine.getLabel({
                    sample: sampleId,
                    path,
                    instanceId,
                    frame: f,
                  });
                  // Defensive: only overwrite filler. If a "real" keyframe
                  // somehow appears in the tail (shouldn't, since we already
                  // checked there's no next keyframe — but engine reads
                  // aren't transactional with our scan), leave it alone.
                  if (!existing || existing.keyframe === true) {
                    continue;
                  }
                  actions.updateLabel(
                    { path, instanceId, frame: f },
                    { ...geometry, keyframe: false },
                  );
                }
              });
            }
          }
        }
      }
    },
    [engine, sampleId, stream, propagate, actions],
  );

  useAnnotationEventHandler(
    "annotation:keyframeChanged",
    useCallback(
      (payload: KeyframeChangedPayload) => {
        // Filter cheaply at enqueue time so we don't accumulate work for
        // events the handler would no-op on anyway.
        if (!payload.instanceId) {
          return;
        }

        const key = `${payload.instanceId}:${payload.frame}:${payload.kind}`;
        pendingRef.current.set(key, payload);

        if (scheduledRef.current) {
          return;
        }
        scheduledRef.current = true;

        queueMicrotask(() => {
          scheduledRef.current = false;
          if (!mountedRef.current) {
            pendingRef.current.clear();
            return;
          }

          // Snapshot + clear before draining so events fired during the drain
          // (unlikely, but possible if `propagate` is synchronous and
          // triggers another keyframeChanged) schedule a fresh microtask.
          const drained = Array.from(pendingRef.current.values());
          pendingRef.current.clear();

          for (const event of drained) {
            runInterp(event);
          }
        });
      },
      [runInterp],
    ),
  );
};
