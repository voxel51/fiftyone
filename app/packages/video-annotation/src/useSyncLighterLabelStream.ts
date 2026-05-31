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
import { objectId } from "@fiftyone/utilities";
import { useCallback, useRef } from "react";
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

  // Synthetic id we want selected once `useFrameOverlaySync` lands the
  // post-mint canonical overlay. Set by `upsertFromOverlay` when it
  // evicts a draw-mode overlay; consumed by the `overlay-added` handler
  // below.
  const pendingSelectRef = useRef<string | null>(null);

  const upsertFromOverlay = useCallback(
    (overlayId: string, isFreshDraw = false) => {
      if (!stream || !scene) return;
      const overlay = scene.getOverlay(overlayId);
      if (!(overlay instanceof DetectionOverlay)) return;

      const detection = toLocalDetection(overlay);

      // Create an `Instance` doc on first draw so the cross-frame
      // identity (used as the synthetic overlay id in
      // `extractDetections`) is stable from the box's first frame
      // onward.
      const minted = isFreshDraw && !detection.instance;
      if (minted) {
        detection.instance = { _cls: "Instance", _id: objectId() };
      }

      const frame = stream.timeToFrame(currentTime);
      stream.updateLabel(frame, detection);

      // The synthetic id just changed (`<overlayId>` → `instance-<...>`)
      // because we minted the Instance. Evict Lighter's draw-mode
      // overlay so the next sync pass adds the canonical one without
      // leaving the original drawn copy behind. The `overlay-removed`
      // event this triggers is safe — the removed-handler below
      // resolves payload ids against the current snapshot and skips
      // ones that no longer map to a cache entry.
      //
      // Removal also drops selection, so register a pending select
      // against the canonical synthetic id; the `overlay-added` handler
      // claims it once the sync places the canonical overlay in scene.
      if (minted) {
        pendingSelectRef.current = `instance-${detection.instance!._id}`;
        scene.removeOverlay(overlayId);
      }
    },
    [stream, scene, currentTime]
  );

  useEventHandler(
    "lighter:overlay-establish",
    useCallback(
      (payload) => upsertFromOverlay(payload.id, true),
      [upsertFromOverlay]
    )
  );

  // Claim a pending select once the sync adds the canonical post-mint
  // overlay
  useEventHandler(
    "lighter:overlay-added",
    useCallback(
      (payload) => {
        if (!scene || pendingSelectRef.current !== payload.id) return;
        pendingSelectRef.current = null;
        scene.selectOverlay(payload.id);
      },
      [scene]
    )
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
        // Resolve the synthetic overlay id back to the underlying
        // detection `_id` via the current snapshot. Two reasons:
        //   1. The cache keys detections by `_id`, not by the synthetic
        //      id we render under, so a direct `deleteLabel(payload.id)`
        //      misses tracked detections (synthetic id `instance-<...>`
        //      or `track-<n>`).
        //   2. Swap-removes initiated by our own draw flow (Lighter's
        //      draw-mode overlay being evicted after we mint an
        //      Instance) carry an id that no longer maps to any cache
        //      entry — skipping them prevents the just-minted
        //      detection from being deleted out from under the sync.
        const snapshot = stream.getValue(currentTime);
        const target = snapshot?.detections.find((d) => d.id === payload.id);
        if (!target?._id) return;
        const frame = stream.timeToFrame(currentTime);
        stream.deleteLabel(frame, target._id);
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
