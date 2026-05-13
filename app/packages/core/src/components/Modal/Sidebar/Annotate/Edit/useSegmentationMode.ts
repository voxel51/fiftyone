/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useRecoilValue } from "recoil";

import {
  AddOverlayCommand,
  BaseOverlay,
  DetectionOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { CommandContextManager } from "@fiftyone/commands";
import { isPatchesView } from "@fiftyone/state";
import { DETECTION } from "@fiftyone/utilities";

import {
  current,
  currentType,
  fieldsOfType,
  useAnnotationContext,
} from "./state";
import { useAIAnnotationMode } from "./useAIAnnotationMode";
import useCreate from "./useCreate";
import useExit from "./useExit";
import {
  SegmentationTool,
  useManualSegmentationTools,
} from "./useManualSegmentationTools";
import { useMergeTool } from "./useMergeTool";

// Re-export tool types/constants and unsafe atoms so existing import paths
// (e.g. `import { SegmentationTool } from "./useSegmentationMode"`) keep
// working after the split into focused hooks.
export {
  DEFAULT_TOOL_MODE,
  DEFAULT_TOOL_SIZE,
  MAX_CURSOR_SIZE,
  MAX_TOOL_SIZE,
  MIN_CURSOR_SIZE,
  MIN_TOOL_SIZE,
  SegmentationTool,
  SegmentationToolMode,
  SegmentationToolShape,
  _unsafeToolAtom,
  _unsafeToolModeAtom,
  _unsafeToolShapeAtom,
  _unsafeToolSizeAtom,
} from "./useManualSegmentationTools";
export type { SegmentationToolState } from "./useManualSegmentationTools";

const segmentationModeActiveAtom = atom<boolean>(false);

/** @internal */ export { segmentationModeActiveAtom as _unsafeSegmentationModeActiveAtom };

// Set of label ids currently being authored as masks. Updated by
// `useBridge` via the public `setEditingMask` action.
const editingMaskLabelIdsAtom = atom<ReadonlySet<string>>(new Set<string>());

// Derived: does the currently-edited label have a mask?
const isEditingMaskAtom = atom((get) => {
  const ids = get(editingMaskLabelIdsAtom);
  if (ids.size === 0) return false;

  const data = get(current)?.data as { _id?: string } | undefined;
  return data?._id !== undefined && ids.has(data._id);
});

/**
 * Segmentation mask tool state hook.
 *
 * Composes:
 * - `useManualSegmentationTools` — brush/pen/select tool state and actions
 * - `useAIAnnotationMode` — AI tool point selection
 *
 * Plus the cross-concern glue (mode activation/deactivation, auto-activate
 * on mask selection, AI tool effect, `create`/`finalizePointSelection` for
 * the bridge).
 */
export const useSegmentationMode = () => {
  const { scene, addOverlay } = useLighter();
  const { selectedLabel } = useAnnotationContext();
  const onExit = useExit();
  const isPatchView = useRecoilValue(isPatchesView);
  const fields = useAtomValue(fieldsOfType(DETECTION));
  const isEditingMask = useAtomValue(isEditingMaskAtom);
  const setEditingMaskIds = useSetAtom(editingMaskLabelIdsAtom);
  const [segmentationModeActive, setSegmentationModeActive] = useAtom(
    segmentationModeActiveAtom
  );

  // Mark `id` as mid-mask authoring (when `hasMask`) or clear that
  const setEditingMask = useCallback(
    (id: string, hasMask: boolean) => {
      setEditingMaskIds((prev) => {
        const has = prev.has(id);
        if (hasMask === has) return prev;

        const next = new Set(prev);

        if (hasMask) next.add(id);
        else next.delete(id);

        return next;
      });
    },
    [setEditingMaskIds]
  );

  const manualMode = useManualSegmentationTools();
  const aiMode = useAIAnnotationMode();
  const mergeTool = useMergeTool();

  const createDetection = useCreate(DETECTION);
  const editingLabelType = useAtomValue(currentType);

  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

  const isEditingSegmentation =
    editingLabelType === DETECTION &&
    (!!selectedLabel?.data?.mask || isEditingMask);

  const noActiveFields = fields.length === 0;
  const disabled = isPatchView || noActiveFields;

  const tooltip = isPatchView
    ? "Creating masks is not supported in this view"
    : noActiveFields
    ? "No active fields"
    : segmentationModeActive
    ? "Exit mask creation"
    : "Create new mask";

  // ---------------  Segmentation mode activation / deactivation  --------- //

  const activateSegmentationMode = useCallback(() => {
    setSegmentationModeActive(true);
  }, [setSegmentationModeActive]);

  /**
   * Disable segmentation mode and gracefully close out any label being edited.
   */
  const deactivateSegmentationMode = useCallback(() => {
    sceneRef.current?.exitInteractiveMode();
    onExit();
    aiMode.deactivate();
    mergeTool.clearMergeTarget();
    manualMode.switchTool(SegmentationTool.Select);
    setSegmentationModeActive(false);
  }, [aiMode, manualMode, mergeTool, onExit, setSegmentationModeActive]);

  const toggleSegmentationMode = useCallback(() => {
    if (segmentationModeActive) {
      deactivateSegmentationMode();
    } else {
      activateSegmentationMode();
    }
  }, [
    segmentationModeActive,
    deactivateSegmentationMode,
    activateSegmentationMode,
  ]);

  /**
   * Persist any in-progress mask edit and exit interactive paint mode.
   * Idempotent — safe to call when there's no open label.
   */
  const closeOpenLabel = useCallback(() => {
    const currentScene = sceneRef.current;
    const currentLabel = selectedLabelRef.current;

    if (
      currentScene &&
      !currentScene.isDestroyed &&
      currentScene.renderLoopActive
    ) {
      currentScene.exitInteractiveMode();

      if (currentLabel?.overlay) {
        addOverlay(currentLabel.overlay as BaseOverlay);
      }
    }
  }, [addOverlay]);

  /**
   * Wraps the manual tool atom setter with the tear-down/setup work that
   * each tool needs around a transition: finalize any open manual edit on
   * the way in, deactivate AI point selection or clear the merge target on
   * the way out. Replaces effect-driven tool reconciliation.
   */
  const switchTool = useCallback(
    (nextTool: SegmentationTool) => {
      const currentTool = manualMode.tool;
      if (currentTool === nextTool) return;

      // Tear down the outgoing tool.
      if (currentTool === SegmentationTool.AI) {
        aiMode.deactivate();
      } else if (currentTool === SegmentationTool.Merge) {
        mergeTool.clearMergeTarget();
      }

      // Set up the incoming tool.
      if (nextTool === SegmentationTool.AI) {
        closeOpenLabel();
        aiMode.activate();
      } else if (nextTool === SegmentationTool.Merge) {
        closeOpenLabel();

        // Adopt an already-selected mask detection as the merge target so
        // the user doesn't have to re-click it. If a non-mask label is
        // selected, deselect it — the Merge tool only operates on masks.
        const selected = selectedLabelRef.current;
        const overlayId = selected?.overlay?.id;
        const hasMask =
          selected?.type === "Detection" &&
          !!(selected.data as { mask?: unknown })?.mask;

        if (hasMask && overlayId) {
          mergeTool.setMergeTarget(overlayId);
        } else if (selected) {
          onExit();
        }
      }

      manualMode.switchTool(nextTool);
    },
    [aiMode, closeOpenLabel, manualMode, mergeTool, onExit]
  );

  // Auto-enable segmentation mode when a pre-existing mask detection is selected,
  // auto-disable when a pre-existing label of a different type is selected.
  //
  // New labels are ignored — the mode was set intentionally via the toolbar button.
  useEffect(() => {
    if (selectedLabel?.isNew) {
      return;
    }

    if (isEditingSegmentation && !segmentationModeActive) {
      setSegmentationModeActive(true);
    } else if (
      editingLabelType &&
      !isEditingSegmentation &&
      segmentationModeActive
    ) {
      setSegmentationModeActive(false);
    }
  }, [
    selectedLabel?.isNew,
    selectedLabel?.overlay,
    editingLabelType,
    isEditingSegmentation,
    segmentationModeActive,
    setSegmentationModeActive,
    manualMode.tool,
    scene,
  ]);

  // -----------------------  Bridge Event Handlers  ----------------------- //

  /**
   * Finalize the previous mask detection (if any) and start a new one.
   */
  const create = useCallback(() => {
    closeOpenLabel();
    // TODO: assume previous `field` and `labelValue`
    // e.g. createDetection({ field, labelValue });
    const newLabel = createDetection();

    if (newLabel?.overlay instanceof DetectionOverlay) {
      newLabel.overlay.initMask();
    }
  }, [closeOpenLabel, createDetection]);

  /**
   * Finish the current AI point-selection session. Cycle deactivate→activate
   * so the keypoint overlay/handler is re-installed for a fresh next
   * detection while staying in AI mode.
   */
  const finalizePointSelection = useCallback(() => {
    const currentScene = sceneRef.current;
    const overlay = selectedLabelRef.current?.overlay;
    if (currentScene && overlay instanceof DetectionOverlay) {
      CommandContextManager.instance()
        .getActiveContext()
        .pushUndoable(new AddOverlayCommand(currentScene, overlay));
    }

    aiMode.deactivate();
    aiMode.activate();
  }, [aiMode]);

  // ----------------------------  Public interface  ----------------------- //

  return useMemo(
    () => ({
      // State (read-only)
      segmentationModeActive,
      isEditingMask,
      disabled,
      tooltip,

      // Mode control
      activateSegmentationMode,
      deactivateSegmentationMode,
      toggleSegmentationMode,

      // Bridge actions (wired to Lighter events by `useBridge`)
      create,
      finalizePointSelection,
      setEditingMask,

      // Tool state and actions
      tool: manualMode.tool,
      toolSize: manualMode.toolSize,
      toolShape: manualMode.toolShape,
      toolMode: manualMode.toolMode,
      switchTool,
      switchToolShape: manualMode.switchToolShape,
      switchToolMode: manualMode.switchToolMode,
      increaseToolSize: manualMode.increaseToolSize,
      decreaseToolSize: manualMode.decreaseToolSize,
      setToolSize: manualMode.setToolSize,

      // Merge tool — composed sub-state for the bridge to drive
      mergeTool,
    }),
    [
      segmentationModeActive,
      isEditingMask,
      disabled,
      tooltip,
      activateSegmentationMode,
      deactivateSegmentationMode,
      toggleSegmentationMode,
      create,
      finalizePointSelection,
      setEditingMask,
      manualMode,
      switchTool,
      mergeTool,
    ]
  );
};
