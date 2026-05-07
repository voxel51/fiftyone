/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  DeleteAnnotationCommand,
  getFieldSchema,
  useAnnotationEventBus,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import { CommandContextManager } from "@fiftyone/commands";
import {
  DetectionOverlay,
  MergeDetectionsCommand,
  useLighter,
} from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { useLabelsContext } from "../useLabels";

const mergeTargetIdAtom = atom(null as string | null);

/** @internal */ export { mergeTargetIdAtom as _unsafeMergeTargetIdAtom };

export interface MergeTool {
  /** Id of the detection currently loaded as the merge target, or null. */
  mergeTargetId: string | null;
  /**
   * Canvas-click handler for the Merge tool. First click sets the target and
   * loads it into the sidebar; subsequent clicks merge the source's mask into
   * the target and delete the source.
   */
  handleOverlayClick: (overlay: DetectionOverlay) => void | Promise<void>;
  /** Drops the merge-target reference. Called on right-click-deselect. */
  clearMergeTarget: () => void;
  /** Tool-switch teardown — clears merge-target. */
  deactivate: () => void;
}

/**
 * State and behavior for the segmentation Merge tool.
 *
 * Sibling of {@link useManualSegmentationTools} and {@link useAIAnnotationMode};
 * composed by {@link useSegmentationMode}.
 */
export const useMergeTool = (): MergeTool => {
  const mergeTargetId = useAtomValue(mergeTargetIdAtom);
  const setMergeTargetId = useSetAtom(mergeTargetIdAtom);
  const annotationEventBus = useAnnotationEventBus();
  const commandBus = useCommandBus();
  const { scene, removeOverlay } = useLighter();
  const {
    addLabelToSidebar,
    getLabelById,
    removeLabelFromSidebar,
  } = useLabelsContext();
  const fieldSchema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const getMergeTargetId = useAtomCallback(
    useCallback((get) => get(mergeTargetIdAtom), [])
  );

  const clearMergeTarget = useCallback(() => {
    setMergeTargetId(null);
  }, [setMergeTargetId]);

  const deactivate = useCallback(() => {
    clearMergeTarget();
  }, [clearMergeTarget]);

  const handleOverlayClick = useCallback(
    async (overlay: DetectionOverlay) => {
      const currentTargetId = getMergeTargetId();

      if (currentTargetId === null) {
        // First click — adopt as target and load into sidebar via the
        // existing detection-establish path.
        setMergeTargetId(overlay.id);
        annotationEventBus.dispatch(
          "annotation:canvasDetectionOverlayEstablish",
          { id: overlay.id, overlay }
        );
        return;
      }

      if (overlay.id === currentTargetId) {
        // Re-clicked the loaded target — no-op.
        return;
      }

      const targetOverlay = scene?.getOverlay(currentTargetId);
      if (!(targetOverlay instanceof DetectionOverlay) || !scene) return;

      const sourceLabel = getLabelById(overlay.id);
      if (!sourceLabel) return;

      const schema = getFieldSchema(fieldSchema, sourceLabel.path);
      if (!schema) return;

      // 1. Merge source mask into target. Snapshots are captured for undo.
      if (!targetOverlay.mergeFrom(overlay)) return;
      const paintData = targetOverlay.getPaintStrokeData();
      if (!paintData) return;

      // 2. Persist deletion of source and detach from UI.
      await commandBus.execute(
        new DeleteAnnotationCommand(sourceLabel, schema)
      );
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
              new DeleteAnnotationCommand(sourceLabel, schema)
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
        overlay.id
      );
      CommandContextManager.instance().getActiveContext().pushUndoable(command);

      // The source click was routed through `lighter:overlay-select`,
      // which the focus hook reacts to by switching the sidebar focus
      // to the source. After deletion of the source, focus would land
      // nowhere — re-select the target so it stays loaded for the next
      // merge click.
      scene.selectOverlay(targetOverlay.id);
    },
    [
      addLabelToSidebar,
      annotationEventBus,
      commandBus,
      fieldSchema,
      getLabelById,
      getMergeTargetId,
      removeLabelFromSidebar,
      removeOverlay,
      scene,
      setMergeTargetId,
    ]
  );

  return useMemo(
    () => ({
      mergeTargetId,
      handleOverlayClick,
      clearMergeTarget,
      deactivate,
    }),
    [mergeTargetId, handleOverlayClick, clearMergeTarget, deactivate]
  );
};
