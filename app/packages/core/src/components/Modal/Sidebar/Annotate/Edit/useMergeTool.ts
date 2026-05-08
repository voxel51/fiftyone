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
   */
  handleOverlayClick: (overlay: DetectionOverlay) => void | Promise<void>;
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

  const sidebarLabels = useAtomValue(labels);
  const disabled = useMemo(
    () =>
      !sidebarLabels.some(
        (label) =>
          label.type === "Detection" &&
          !!(label.data as { mask?: unknown })?.mask
      ),
    [sidebarLabels]
  );

  const clearMergeTarget = useCallback(() => {
    setMergeTargetId(null);
  }, [setMergeTargetId]);

  const handleOverlayClick = useCallback(
    async (overlay: DetectionOverlay) => {
      if (mergeTargetId === null) {
        setMergeTargetId(overlay.id);
        return;
      }

      if (overlay.id === mergeTargetId) {
        // Re-clicked the loaded target — no-op.
        return;
      }

      const targetOverlay = scene?.getOverlay(mergeTargetId);
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
      mergeTargetId,
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
      disabled,
    }),
    [mergeTargetId, handleOverlayClick, clearMergeTarget, disabled]
  );
};
