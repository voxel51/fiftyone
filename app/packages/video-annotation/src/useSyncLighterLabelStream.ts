/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  DetectionOverlay,
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import { useCallback } from "react";
import { useCurrentTime } from "../../playback/src/lib/playback/use-playback-state";
import { useFrameLabelsStream } from "./frameLabelsStream";
import type { LocalDetection } from "./VideoFrameLabelsStream";

/**
 * Mirrors user-driven Lighter overlay edits into the label-stream cache
 * so they survive frame scrubs.
 *
 * Persistence to the server is the eventual delta supplier's job; this
 * hook only keeps the local cache aligned with what the user sees on
 * the canvas:
 *   - **Draw**: `lighter:overlay-establish` → `updateLabel`.
 *   - **Drag / resize**: `lighter:overlay-drag-end` /
 *     `overlay-resize-end` → `updateLabel` with the new bounds.
 *   - **Delete**: `lighter:overlay-removed` → `deleteLabel`.
 *
 * Synthetic-label mode has no stream to write to — the hook is a no-op
 * when `useFrameLabelsStream()` returns `null`.
 *
 * @param scene - The scene whose overlay events are mirrored, or `null`
 *   while it's still being set up.
 */
export const useSyncLighterLabelStream = (scene: Scene2D | null): void => {
  const stream = useFrameLabelsStream();
  const currentTime = useCurrentTime();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const upsertFromOverlay = useCallback(
    (overlayId: string) => {
      if (!stream || !scene) return;
      const overlay = scene.getOverlay(overlayId);
      if (!(overlay instanceof DetectionOverlay)) return;

      const frame = stream.timeToFrame(currentTime);
      stream.updateLabel(frame, toLocalDetection(overlay));
    },
    [stream, scene, currentTime]
  );

  useEventHandler(
    "lighter:overlay-establish",
    useCallback((payload) => upsertFromOverlay(payload.id), [upsertFromOverlay])
  );

  // Lighter flips `interactionState` to `"DRAGGING"` on every pointer-down
  // over an overlay, so a click-to-select fires `overlay-drag-end` with
  // `startBounds === bounds`. Filter those out — selection is not an edit
  // and writing the cache would (a) churn the dirty set and (b) auto-
  // promote the label to a keyframe via `toLocalDetection`.
  useEventHandler(
    "lighter:overlay-drag-end",
    useCallback(
      (payload) => {
        if (rectsEqual(payload.startBounds, payload.bounds)) return;
        upsertFromOverlay(payload.id);
      },
      [upsertFromOverlay]
    )
  );

  useEventHandler(
    "lighter:overlay-resize-end",
    useCallback(
      (payload) => {
        if (rectsEqual(payload.startBounds, payload.bounds)) return;
        upsertFromOverlay(payload.id);
      },
      [upsertFromOverlay]
    )
  );

  useEventHandler(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        if (!stream) return;
        const frame = stream.timeToFrame(currentTime);
        stream.deleteLabel(frame, payload.id);
      },
      [stream, currentTime]
    )
  );
};

/**
 * Project a Lighter `DetectionOverlay` onto the
 * {@link LocalDetection} shape the stream's cache stores.
 *
 * Reads bounds from the overlay directly (not from event payloads) so
 * the cache always sees the post-edit state regardless of which event
 * triggered the write.
 */
function toLocalDetection(overlay: DetectionOverlay): LocalDetection {
  const bounds = overlay.relativeBounds;
  const label = overlay.label as DetectionLabel;
  // Prefer the real MongoDB `_id` from the underlying label so cache
  // upserts match the existing baseline entry. `overlay.id` is the
  // synthetic `track-<n>` id used for cross-frame identity and won't
  // match anything in the baseline detections array.
  // Any overlay event reaching this helper came from a user action
  // (draw / drag-end / resize-end with real movement). Promote to a
  // keyframe — the label is now user-authoritative for this frame.
  // Propagation is intentionally not cleared here: the cache's shallow
  // merge preserves it from the existing entry, and unconditionally
  // writing `propagation: null` produces noisy `add value: null` patch
  // ops against baselines that have no propagation field at all.
  // Clearing-on-edit becomes a separate concern once we have a way to
  // condition on the cache state without a layering violation.
  const det: LocalDetection = {
    _cls: "Detection",
    _id: label._id ?? overlay.id,
    label: label.label,
    bounding_box: [bounds.x, bounds.y, bounds.width, bounds.height],
    keyframe: true,
  };

  if (label.index !== undefined) {
    det.index = label.index;
  }

  if (label.instance) {
    det.instance = label.instance;
  }

  return det;
}

/** Strict equality on the four bbox dimensions. */
function rectsEqual(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}
