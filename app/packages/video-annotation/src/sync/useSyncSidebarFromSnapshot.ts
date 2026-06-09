/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { DetectionOverlay, type Scene2D } from "@fiftyone/lighter";
import { useEffect, useRef } from "react";
import { useLabelsContext } from "../../../core/src/components/Modal/Sidebar/Annotate";
import { toDetectionLabel } from "../overlayAdapters/detection";
import type { FrameLabelSnapshot } from "../streams/SyntheticLabelStream";

/**
 * Reconciles the annotation sidebar against the current {@link FrameLabelSnapshot}
 * once per frame tick. The snapshot is the per-frame source of truth for video:
 * which detections are visible *and* what their current data is. Driving the
 * sidebar off `lighter:overlay-added`/`removed` would only capture membership
 * transitions and freeze each entry's data at first-seen-frame.
 *
 * On each tick:
 *  - For every detection in the snapshot, push its current data into the
 *    sidebar (`updateLabelData` if already present, `addLabelToSidebar`
 *    otherwise). This keeps `_id`, `bounding_box`, `index`, and `instance`
 *    aligned with the displayed frame — important because tracked detections
 *    are a different mongo doc each frame.
 *  - Remove sidebar entries whose synthetic id is no longer in the snapshot.
 *
 * Must run *after* {@link useFrameOverlaySync} in the same component so the
 * overlays for newly-appeared detections already exist when this hook calls
 * `scene.getOverlay(...)`. Effects execute in declaration order.
 *
 * Gates on `canonicalMediaReady` for the same reason `useFrameOverlaySync`
 * does: before the canonical media lands, that hook short-circuits and no
 * overlays are in the scene.
 */
export const useSyncSidebarFromSnapshot = (
  scene: Scene2D | null,
  snapshot: FrameLabelSnapshot | null,
  field: string,
  canonicalMediaReady: boolean
): void => {
  const { addLabelToSidebar, removeLabelFromSidebar, updateLabelData } =
    useLabelsContext();
  const trackedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!scene || !snapshot || !canonicalMediaReady) {
      return;
    }

    const next = new Set<string>();

    for (const det of snapshot.detections) {
      next.add(det.id);

      const data = toDetectionLabel(det);

      if (updateLabelData(det.id, data)) {
        continue;
      }

      const overlay = scene.getOverlay(det.id);
      if (!(overlay instanceof DetectionOverlay)) {
        continue;
      }

      addLabelToSidebar({
        data,
        overlay,
        path: field,
        type: "Detection",
      });
    }

    for (const id of Array.from(trackedRef.current)) {
      if (!next.has(id)) {
        removeLabelFromSidebar(id);
      }
    }
    trackedRef.current = next;
  }, [
    scene,
    snapshot,
    field,
    canonicalMediaReady,
    addLabelToSidebar,
    removeLabelFromSidebar,
    updateLabelData,
  ]);

  useEffect(() => {
    return () => {
      for (const id of trackedRef.current) {
        removeLabelFromSidebar(id);
      }

      trackedRef.current.clear();
    };
  }, [removeLabelFromSidebar]);
};
