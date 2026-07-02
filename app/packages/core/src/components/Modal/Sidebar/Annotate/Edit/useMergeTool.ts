/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  getFieldSchema,
  useAnnotationEngine,
  useDeleteAnnotation,
} from "@fiftyone/annotation";
import { DetectionOverlay, useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { labels, useLabelsContext } from "../useLabels";

const mergeTargetIdAtom = atom(null as string | null);

/** @internal */ export { mergeTargetIdAtom as _unsafeMergeTargetIdAtom };

export interface MergeTool {
  /** Id of the detection currently loaded as the merge target, or null. */
  mergeTargetId: string | null;
  /**
   * Canvas-click handler for the Merge tool. First click sets the target and
   * loads it into the sidebar; subsequent clicks merge the source's mask into
   * the target and delete the source.
   *
   * Returns `true` when the click was consumed as a source-click (or re-click
   * of the target) and the caller should *skip* its normal focus handling.
   * Returns `false` when the click was a first-click that adopted a new
   * target — the caller should still route focus so the sidebar loads it.
   * Async backend work (the source delete) is kicked off internally and is
   * not awaited.
   */
  handleOverlayClick: (overlay: DetectionOverlay) => boolean;
  /** Sets the merge-target id directly (e.g. on tool entry with a selection). */
  setMergeTarget: (id: string | null) => void;
  /** Drops the merge-target reference. Called on right-click-deselect. */
  clearMergeTarget: () => void;
  /** True when the tool has nothing to operate on (no mask detections). */
  disabled: boolean;
}

/**
 * State and behavior for the segmentation Merge tool.
 *
 * Sibling of {@link useManualSegmentationTools} and {@link useAIAnnotationMode};
 * composed by {@link useSegmentationMode}.
 */
export const useMergeTool = (): MergeTool => {
  const [mergeTargetId, setMergeTargetId] = useAtom(mergeTargetIdAtom);
  const deleteAnnotation = useDeleteAnnotation();
  const engine = useAnnotationEngine();
  const { scene } = useLighter();
  const { getLabelById } = useLabelsContext();
  const fieldSchema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE }),
  );

  const sidebarLabels = useAtomValue(labels);
  const disabled = useMemo(() => {
    const maskCount = sidebarLabels.reduce((count, label) => {
      const data = label.data as {
        mask?: unknown;
        mask_path?: unknown;
      };
      const hasMask =
        label.type === "Detection" && !!(data?.mask || data?.mask_path);

      return hasMask ? count + 1 : count;
    }, 0);

    return maskCount < 2;
  }, [sidebarLabels]);

  const setMergeTarget = useCallback(
    (id: string | null) => {
      setMergeTargetId(id);
    },
    [setMergeTargetId],
  );

  const clearMergeTarget = useCallback(() => {
    setMergeTargetId(null);
  }, [setMergeTargetId]);

  const handleOverlayClick = useCallback(
    (overlay: DetectionOverlay): boolean => {
      if (mergeTargetId === null) {
        setMergeTargetId(overlay.id);
        return false;
      }

      if (overlay.id === mergeTargetId) {
        return true;
      }

      const targetOverlay = scene?.getOverlay(mergeTargetId);
      if (!(targetOverlay instanceof DetectionOverlay) || !scene) return true;

      const sourceLabel = getLabelById(overlay.id);
      if (!sourceLabel) return true;

      const schema = getFieldSchema(fieldSchema, sourceLabel.path);
      if (!schema) return true;

      // One gesture id tags every commit this merge causes — the target's bbox
      // + async mask re-encode (stamped onto the events `mergeFrom` emits, read
      // by the engine bridge) and the source delete (below) — so a single Ctrl-Z
      // reverts the whole merge. Scoped to these writes: nothing else coalesces.
      const gestureId = engine.mintGestureId();

      // 1. Merge source mask into target. The merged-target commits flow
      // through the engine (captured for undo); snapshots back the rollback.
      if (!targetOverlay.mergeFrom(overlay, gestureId)) return true;
      const paintData = targetOverlay.getPaintStrokeData();
      if (!paintData) return true;

      // Backend deletion happens async
      void (async () => {
        // 2. Persist deletion of source and detach from UI. The mask mutation
        // in step 1 is already visible locally — if the backend delete fails,
        // roll the target's mask back so the canvas / sidebar / pending
        // persist state stay in sync. The engine's value-based undo stack owns
        // reverting the merge (target commits + the source delete).
        try {
<<<<<<< HEAD
          await commandBus.execute(
            new DeleteAnnotationCommand(sourceLabel, schema),
          );
=======
          await deleteAnnotation(sourceLabel, { gestureId });
>>>>>>> main
        } catch (err) {
          targetOverlay.restoreMaskSnapshot(
            paintData.beforeSnapshot,
            paintData.beforeBounds,
          );
          console.error("Merge tool: failed to delete source detection", err);
          return;
        }
<<<<<<< HEAD
        removeLabelFromSidebar(overlay.id);
        removeOverlay(overlay.id, false);

        // 3. Push composite undoable. `execute` (= redo) re-applies the
        // merged mask and re-deletes; `undo` restores the pre-merge mask
        // and re-adds the source overlay/label.
        const command = new MergeDetectionsCommand(
          targetOverlay,
          paintData,
          {
            deleteSource: async () => {
              await commandBus.execute(
                new DeleteAnnotationCommand(sourceLabel, schema),
              );
              removeLabelFromSidebar(overlay.id);
              removeOverlay(overlay.id, false);
            },
            restoreSource: () => {
              scene.addOverlay(overlay);
              addLabelToSidebar(sourceLabel);
            },
          },
          targetOverlay.id,
          overlay.id,
        );

        CommandContextManager.instance()
          .getActiveContext()
          .pushUndoable(command);
=======
>>>>>>> main

        scene.selectOverlay(targetOverlay.id);
      })();

      return true;
    },
    [
      deleteAnnotation,
      engine,
      fieldSchema,
      getLabelById,
      mergeTargetId,
      scene,
      setMergeTargetId,
    ],
  );

  return useMemo(
    () => ({
      mergeTargetId,
      handleOverlayClick,
      setMergeTarget,
      clearMergeTarget,
      disabled,
    }),
    [
      mergeTargetId,
      handleOverlayClick,
      setMergeTarget,
      clearMergeTarget,
      disabled,
    ],
  );
};
