import {
  type BaseOverlay,
  ClassificationOverlay,
  DetectionOverlay,
  KeypointOverlay,
  type KeypointLabel,
  PolylineOverlay,
  type Scene2D,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import type { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import {
  hasValidBounds,
  type LabelData,
  type Sample,
  type SampleChange,
  SampleChangeKind,
} from "@fiftyone/utilities";
import { useCallback, useEffect, useRef } from "react";
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

/** Find the overlay backing a (field, labelId) address, if one is mounted. */
const findOverlay = (
  scene: Scene2D,
  path: string,
  labelId: string | undefined
): BaseOverlay | undefined => {
  if (labelId) {
    // Overlays loaded from the sample carry their label `_id` as their id.
    const direct = scene.getOverlay(labelId);
    if (direct && direct.field === path) {
      return direct;
    }
  }

  return scene
    .getAllOverlays()
    .find(
      (o) =>
        o.field === path &&
        (labelId === undefined ||
          (o.label as { _id?: string })?._id === labelId)
    );
};

/** Apply a resolved label to the overlay backing (path, labelId), if any. */
const applyLabelToOverlay = (
  scene: Scene2D,
  path: string,
  labelId: string | undefined,
  label: LabelData | undefined
): void => {
  if (!label) {
    return;
  }

  const overlay = findOverlay(scene, path, labelId);
  if (!overlay) {
    return;
  }

  // Defensive: never apply over a live gesture.
  const interactive = overlay as { isInteracting?: () => boolean };
  if (interactive.isInteracting?.()) {
    return;
  }

  overlay.applyLabel(label as Parameters<BaseOverlay["applyLabel"]>[0]);
};

/**
 * Reconcile one Sample change onto its overlay(s) (the read-half). Applies via
 * the silent {@link BaseOverlay.applyLabel} so it never re-enters the
 * overlay→Sample write path.
 *
 * A list-label change with no `labelId` addresses the whole field — e.g.
 * `reconcilePersisted` releasing a server-owned mask, keyed by the parent field
 * (`ground_truth`), not an element. Those reconcile each element by `_id`;
 * resolving the parent path would yield the `Detections` container, not a label.
 */
export const applyChangeToOverlay = (
  scene: Scene2D,
  sample: Sample,
  change: SampleChange
): void => {
  if (change.kind === SampleChangeKind.Delete || change.path === "") {
    return;
  }

  if (!change.labelId && sample.isListLabel(change.path)) {
    for (const label of sample.listLabels(change.path)) {
      applyLabelToOverlay(scene, change.path, label._id, label);
    }
    return;
  }

  const label = change.labelId
    ? sample.getLabel(change.path, change.labelId)
    : sample.getResolved<LabelData>(change.path);
  applyLabelToOverlay(scene, change.path, change.labelId, label);
};

/**
 * Bidirectional bridge between Lighter (2D) overlays and the shared
 * {@link Sample}. Mount once at the annotation root.
 *
 * - **Write-half:** on each edit-finalize event the affected overlay is re-read
 *   and written into Sample via `updateLabel` (upserts list-label elements by
 *   `_id`, structural-diffs the parent on persistence). Deletions flow through
 *   their own command path, unchanged.
 * - **Read-half:** Sample changes are reconciled back onto overlays via the
 *   silent `applyLabel`. The write itself is skipped (origin suppression): a
 *   write-half `updateLabel` dispatches its change synchronously, so the
 *   read-half runs inside the `writing` window and ignores it — the overlay
 *   already holds that value. Non-overlay-origin changes (e.g.
 *   `reconcilePersisted` releasing a server-owned mask) reconcile normally.
 */
export const useSyncLighterSample = (): void => {
  const { scene } = useLighter();
  const sample = useSampleInstance();
  const handleLighterEvent = useLighterEventHandler(scene?.getEventChannel());

  // Set while the write-half writes Sample. notify() dispatches synchronously,
  // so the read-half runs inside this window and skips the change we authored —
  // origin suppression by call stack, no value comparison (cf. echo guards).
  const writing = useRef(false);

  const syncOverlay = useCallback(
    (evt: { overlayId: string }) => {
      const overlay = scene?.getOverlay(evt.overlayId);
      if (!overlay) {
        return;
      }

      const data = buildOverlayLabel(overlay);
      if (!data) {
        return;
      }

      writing.current = true;
      try {
        sample.updateLabel(overlay.field, data);
      } finally {
        writing.current = false;
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

  useEffect(() => {
    if (!scene) {
      return undefined;
    }

    return sample.subscribeChanges((changes) => {
      if (writing.current) {
        return;
      }

      for (const change of changes) {
        applyChangeToOverlay(scene, sample, change);
      }
    });
  }, [scene, sample]);
};
