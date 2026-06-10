import {
  type BaseOverlay,
  ClassificationOverlay,
  DetectionOverlay,
  KeypointOverlay,
  type KeypointLabel,
  PolylineOverlay,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import type { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { hasValidBounds, type LabelData } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useSampleInstance } from "./useSample";

/**
 * Derive the persistable label document from a Lighter overlay, shaped for
 * {@link Sample.updateLabel}.
 *
 * @param overlay Lighter overlay
 */
const buildOverlayLabel = (overlay: BaseOverlay): LabelData | undefined => {
  // Non-persistent overlays live in the scene for UX only and must never
  // reach the persistence pipeline.
  if (!overlay.isPersistent) {
    return undefined;
  }

  if (overlay instanceof DetectionOverlay) {
    const bounds = overlay.relativeBounds;
    const boundingBox: [number, number, number, number] = [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    ];

    if (!hasValidBounds(boundingBox)) {
      return undefined;
    }

    // Pull mask/mask_path off so we can decide what (if anything) to persist
    // for the mask channel.
    const { mask: _mask, mask_path: _maskPath, ...data } = overlay.label;
    const pendingMask = overlay.getPendingMask();

    // Include mask data only when the overlay still has a mask. Explicitly null
    // out mask/mask_path when removed so the structural diff overrides the
    // existing value.
    const hadMask = _mask || _maskPath;
    const maskData = overlay.hasMask()
      ? {
          ...(_mask && { mask: _mask }),
          ...(pendingMask && { mask: pendingMask }),
          // Edits to a `mask_path`-sourced detection are persisted as an inline
          // `mask`; null the path so the backend doesn't end up with both
          // fields pointing at divergent data.
          ...(pendingMask && _maskPath && { mask_path: null }),
        }
      : hadMask
      ? { mask: null, mask_path: null }
      : {};

    return {
      ...(data as DetectionLabel),
      ...maskData,
      bounding_box: boundingBox,
    } as unknown as LabelData;
  } else if (overlay instanceof ClassificationOverlay) {
    const label = overlay.label as ClassificationLabel;
    return label as unknown as LabelData;
  } else if (overlay instanceof PolylineOverlay) {
    // Must be checked before KeypointOverlay, since PolylineOverlay extends it.
    const label = overlay.label as unknown as PolylineLabel;

    return {
      ...label,
      points: overlay.getNestedPoints(),
      closed: overlay.getClosed(),
      filled: overlay.getFilled(),
    } as unknown as LabelData;
  } else if (overlay instanceof KeypointOverlay) {
    const label = overlay.label as KeypointLabel;
    return label as unknown as LabelData;
  }

  return undefined;
};

/**
 * Mirror Lighter (2D) overlay edits onto the shared {@link Sample} instance.
 *
 * On every edit-finalize event, the affected overlay is re-read from the scene
 * and written into Sample via `updateLabel` (which upserts list-label elements
 * by `_id` and structural-diffs the parent on persistence).
 *
 * Deletions are intentionally not handled here — 2D deletions flow through their
 * own command/persistence path, unchanged.
 *
 * Mount once at the annotation root.
 */
export const useSyncLighterSample = (): void => {
  const { scene } = useLighter();
  const sample = useSampleInstance();
  const handleLighterEvent = useLighterEventHandler(scene?.getEventChannel());

  const syncOverlay = useCallback(
    (evt: { overlayId: string }) => {
      const overlay = scene?.getOverlay(evt.overlayId);
      if (!overlay) {
        return;
      }

      const data = buildOverlayLabel(overlay);
      if (data) {
        sample.updateLabel(overlay.field, data);
      }
    },
    [scene, sample]
  );

  handleLighterEvent("lighter:overlay-label-updated", syncOverlay);
  handleLighterEvent("lighter:overlay-establish", syncOverlay);
  handleLighterEvent("lighter:overlay-added", syncOverlay);
  handleLighterEvent("lighter:overlay-drag-end", syncOverlay);
  handleLighterEvent("lighter:overlay-resize-end", syncOverlay);
  handleLighterEvent("lighter:overlay-paint-end", syncOverlay);
  handleLighterEvent("lighter:keypoint-point-added", syncOverlay);
  handleLighterEvent("lighter:keypoint-point-moved", syncOverlay);
  handleLighterEvent("lighter:keypoint-point-deleted", syncOverlay);
};
