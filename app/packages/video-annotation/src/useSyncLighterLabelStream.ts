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
import { useFrameLabelsStream } from "./FrameLabelsContext";
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

  useEventHandler(
    "lighter:overlay-drag-end",
    useCallback((payload) => upsertFromOverlay(payload.id), [upsertFromOverlay])
  );

  useEventHandler(
    "lighter:overlay-resize-end",
    useCallback((payload) => upsertFromOverlay(payload.id), [upsertFromOverlay])
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
  return {
    _id: overlay.id,
    label: label.label,
    bounding_box: [bounds.x, bounds.y, bounds.width, bounds.height],
    index: label.index,
    instance: label.instance ?? null,
  };
}
