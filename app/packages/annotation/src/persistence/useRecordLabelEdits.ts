/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type Action,
  KnownContexts,
  useCommandContext,
} from "@fiftyone/commands";
import {
  type BaseOverlay,
  ClassificationOverlay,
  DetectionOverlay,
  KeypointOverlay,
  type KeypointLabel,
  PolylineOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import type { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { BoundingBox } from "@fiftyone/looker/src/state";
import { useModalSample } from "@fiftyone/state";
import { hasValidBounds } from "@fiftyone/utilities";
import { useCallback, useEffect } from "react";
import type { LabelProxy } from "../deltas";
import { useGetLabelDelta } from "./useGetLabelDelta";
import { useRecordEdit } from "./useRecordEdit";

/**
 * Build a {@link LabelProxy} instance from a lighter overlay.
 */
const buildAnnotationLabel = (overlay: BaseOverlay): LabelProxy | undefined => {
  // Non-persistent overlays live in the scene for UX only and must never
  // reach the persistence pipeline.
  if (!overlay.isPersistent) {
    return undefined;
  }

  if (overlay instanceof DetectionOverlay) {
    const bounds = overlay.relativeBounds;
    const boundingBox: BoundingBox = [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    ];

    if (hasValidBounds(boundingBox)) {
      // Pull mask/mask_path off so we can decide what (if anything) to persist
      // for the mask channel.
      const { mask: _mask, mask_path: _maskPath, ...data } = overlay.label;
      const pendingMask = overlay.getPendingMask();

      // Include mask data only when the overlay still has a mask. Explicitly
      // null out mask/mask_path when removed so the updated value overrides the
      // original.
      const hadMask = _mask || _maskPath;
      const maskData = overlay.hasMask()
        ? {
            ...(_mask && { mask: _mask }),
            ...(pendingMask && { mask: pendingMask }),
            // Edits to a `mask_path`-sourced detection are persisted as an
            // inline `mask`; null the path so the backend doesn't end up with
            // both fields pointing at divergent data.
            ...(pendingMask && _maskPath && { mask_path: null }),
          }
        : hadMask
        ? { mask: null, mask_path: null }
        : {};

      return {
        type: "Detection",
        data: {
          ...data,
          ...maskData,
        } as DetectionLabel,
        boundingBox,
        path: overlay.field,
      };
    }
  } else if (overlay instanceof ClassificationOverlay) {
    return {
      type: "Classification",
      data: overlay.label as ClassificationLabel,
      path: overlay.field,
    };
  } else if (overlay instanceof PolylineOverlay) {
    // Must be checked before KeypointOverlay, since PolylineOverlay extends it.
    const label = overlay.label as unknown as PolylineLabel;
    return {
      type: "Polyline",
      data: {
        ...label,
        points: overlay.getNestedPoints(),
        closed: overlay.getClosed(),
        filled: overlay.getFilled(),
      } as PolylineLabel,
      path: overlay.field,
    };
  } else if (overlay instanceof KeypointOverlay) {
    return {
      type: "Keypoint",
      data: overlay.label as KeypointLabel,
      path: overlay.field,
    };
  }

  return undefined;
};

/**
 * Resolve the overlay an undoable action targets. Lighter commands hold their
 * overlay under ``overlay`` (sometimes wrapped in an interaction handler that
 * exposes ``getOverlay()``) or ``target`` (merge), so duck-type rather than
 * enumerate command classes.
 */
const unwrapOverlay = (candidate: unknown): BaseOverlay | null => {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const handler = candidate as { getOverlay?: () => unknown };
  const overlay =
    typeof handler.getOverlay === "function" ? handler.getOverlay() : candidate;
  if (
    overlay &&
    typeof overlay === "object" &&
    typeof (overlay as { id?: unknown }).id === "string" &&
    typeof (overlay as { field?: unknown }).field === "string"
  ) {
    return overlay as BaseOverlay;
  }
  return null;
};

const extractActionOverlays = (action: Action): BaseOverlay[] => {
  const record = action as unknown as Record<string, unknown>;
  const overlays: BaseOverlay[] = [];
  for (const candidate of [record.overlay, record.target]) {
    const overlay = unwrapOverlay(candidate);
    if (overlay && !overlays.includes(overlay)) {
      overlays.push(overlay);
    }
  }
  return overlays;
};

/**
 * Record every 2D canvas edit the moment it happens — one per-label delta per
 * edit, recorded into the pending-edits ledger and written through to the
 * canonical sample copy (see {@link useRecordEdit}).
 *
 * All canvas mutations — drawing, moving, resizing, painting, point edits,
 * label updates, merges, undo, redo — flow through the annotate command
 * context's action stack, so one subscription captures them all; label
 * mutations applied outside the stack (e.g. AI inference) arrive via
 * ``lighter:overlay-label-updated``. The recorded delta carries the value at
 * edit time, so a flush never has to read the scene — and a flush that runs
 * after navigation tore the scene down still saves the last edits.
 *
 * This should be called once in the composition root (the modal).
 */
export const useRecordLabelEdits = () => {
  const { scene } = useLighter();
  const sampleId = useModalSample()?.sample?._id ?? null;
  const { context } = useCommandContext(KnownContexts.ModalAnnotate);
  const recordEdit = useRecordEdit();

  // `includeUnchanged`: always record — the ledger resolves no-ops, so an edit
  // moved back to its starting value correctly supersedes the earlier record.
  const getMutateDelta = useGetLabelDelta(buildAnnotationLabel, {
    includeUnchanged: true,
  });
  const getDeleteDelta = useGetLabelDelta(buildAnnotationLabel, {
    opType: "delete",
    includeUnchanged: true,
  });

  const recordOverlay = useCallback(
    (overlay: BaseOverlay) => {
      if (!sampleId || !overlay.field) {
        return;
      }
      // An overlay the action left out of the scene was removed — a delete.
      const delta = scene?.hasOverlay(overlay.id)
        ? getMutateDelta(overlay, overlay.field)
        : getDeleteDelta(overlay, overlay.field);
      if (delta) {
        recordEdit(sampleId, delta);
      }
    },
    [getDeleteDelta, getMutateDelta, recordEdit, sampleId, scene]
  );

  // Execute/push/undo/redo of any undoable in the annotate context (or its
  // parents) — the single funnel for 2D canvas edits.
  useEffect(
    () =>
      context.subscribeActions((_id, _isUndo, action) => {
        if (action) {
          extractActionOverlays(action).forEach(recordOverlay);
        }
      }),
    [context, recordOverlay]
  );

  // Label mutations applied outside the command stack (e.g. AI inference
  // writing a mask via updateLabel).
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  useEventHandler(
    "lighter:overlay-label-updated",
    useCallback(
      (payload: { id: string }) => {
        const overlay = scene?.getOverlay(payload.id);
        if (overlay) {
          recordOverlay(overlay);
        }
      },
      [recordOverlay, scene]
    )
  );
};
