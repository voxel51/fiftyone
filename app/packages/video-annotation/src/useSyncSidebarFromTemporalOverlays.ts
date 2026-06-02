/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type Scene2D, TemporalOverlay } from "@fiftyone/lighter";
import { type AnnotationLabelData, useModalSample } from "@fiftyone/state";
import { useEffect } from "react";
import {
  useGetSidebarLabels,
  useLabelsContext,
} from "../../core/src/components/Modal/Sidebar/Annotate";
import { frameAt } from "../../playback/src/lib/playback/utils";
import { usePlayhead } from "../../playback/src/lib/playback/use-playback-state";

const TEMPORAL_DETECTION = "TemporalDetection" as const;

/**
 * Frame-gates `TemporalDetection` sidebar membership so TDs behave like
 * tracked detections: listed only while the playhead is within their
 * `support` range.
 *
 * Why this is needed: video detections live under `frames.` and never hydrate
 * into the sidebar from the sample, so {@link useSyncSidebarFromSnapshot} is
 * their sole, frame-driven source. `TemporalDetections` are sample-level, so
 * the sidebar hydrates all of them on load and nothing removes them per frame —
 * they'd otherwise stay listed across the whole clip. This hook reconciles each
 * playhead tick:
 *   - in-range TD overlays are added (or refreshed) in the sidebar,
 *   - any TD-typed sidebar entry whose support no longer contains the frame is
 *     removed (covers both entries this hook added and sample-hydrated ones).
 *
 * The TemporalOverlays stay in the scene regardless of frame — their canvas
 * chip self-gates on `support` (see {@link useTemporalOverlaySync}); only
 * sidebar membership is gated here. Mounts alongside
 * {@link useSyncSidebarFromSnapshot} in the video tiles.
 */
export const useSyncSidebarFromTemporalOverlays = (
  scene: Scene2D | null,
  canonicalMediaReady: boolean
): void => {
  const { addLabelToSidebar, removeLabelFromSidebar, updateLabelData } =
    useLabelsContext();
  const getSidebarLabels = useGetSidebarLabels();

  const sample = useModalSample();
  const frameRate = sample?.frameRate;
  const playheadSec = usePlayhead();
  // Same frame mapping the TemporalOverlay time-gate uses.
  const frame =
    frameRate && Number.isFinite(frameRate) && frameRate > 0
      ? frameAt(playheadSec, frameRate)
      : null;

  useEffect(() => {
    if (!scene || !canonicalMediaReady || frame === null) {
      return;
    }

    const inRange = new Set<string>();

    for (const overlay of scene.getAllOverlays()) {
      if (!(overlay instanceof TemporalOverlay)) continue;

      const support = overlay.label?.support;
      if (
        !Array.isArray(support) ||
        support.length !== 2 ||
        frame < support[0] ||
        frame > support[1]
      ) {
        continue;
      }
      inRange.add(overlay.id);

      // Keep the row's data aligned with the overlay's current (possibly
      // locally-edited) label; add it if not already present.
      const data = overlay.label as unknown as AnnotationLabelData;
      if (updateLabelData(overlay.id, data)) {
        continue;
      }
      addLabelToSidebar({
        data,
        overlay,
        path: overlay.field,
        type: TEMPORAL_DETECTION,
      });
    }

    // Evict TD rows whose support no longer contains the frame. Reading the
    // live sidebar (rather than tracking only our own adds) lets us also
    // remove entries the sample hydration added on load.
    for (const label of getSidebarLabels()) {
      if (label.type !== TEMPORAL_DETECTION) continue;
      if (!inRange.has(label.overlay.id)) {
        removeLabelFromSidebar(label.overlay.id);
      }
    }
  }, [
    scene,
    frame,
    canonicalMediaReady,
    addLabelToSidebar,
    removeLabelFromSidebar,
    updateLabelData,
    getSidebarLabels,
  ]);
};
