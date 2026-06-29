/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtom } from "jotai";
import { useRecoilValue } from "recoil";

import { CommandContextManager } from "@fiftyone/commands";
import {
  AddOverlayCommand,
  BaseOverlay,
  DetectionOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { isPatchesView } from "@fiftyone/state";
import { DETECTION } from "@fiftyone/utilities";

import {
  useAnnotationContext,
  useAnnotationFields,
} from "./useAnnotationContext";
import { useAIAnnotationMode } from "./useAIAnnotationMode";
import useExit from "./useExit";
import {
  SegmentationTool,
  useManualSegmentationTools,
} from "./useManualSegmentationTools";
import { useMergeTool } from "./useMergeTool";
import { usePenTool } from "./usePenTool";

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
  const { selected, createNew } = useAnnotationContext();
  const isEditingMask = selected?.isEditingMask ?? false;
  const onExit = useExit();
  const isPatchView = useRecoilValue(isPatchesView);
  const { fields } = useAnnotationFields(DETECTION);
  const [segmentationModeActive, setSegmentationModeActive] = useAtom(
    segmentationModeActiveAtom,
  );

  const manualMode = useManualSegmentationTools();
  const aiMode = useAIAnnotationMode();
  const mergeTool = useMergeTool();

  const editingLabelType = selected?.type ?? null;

  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const selectedLabelRef = useRef(selected?.label ?? null);
  selectedLabelRef.current = selected?.label ?? null;

  // `mask` and `mask_path` are Detection-only fields; cast at the access
  // site since the union narrows them out.
  const labelData = selected?.label.data as
    | { mask?: unknown; mask_path?: unknown }
    | undefined;
  const isEditingSegmentation =
    editingLabelType === DETECTION &&
    (!!labelData?.mask || !!labelData?.mask_path || isEditingMask);

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
        const target = selectedLabelRef.current;
        const overlayId = target?.overlay?.id;
        const data = target?.data as {
          mask?: unknown;
          mask_path?: unknown;
        };
        const hasMask =
          target?.type === "Detection" && !!(data?.mask || data?.mask_path);

        if (hasMask && overlayId) {
          mergeTool.setMergeTarget(overlayId);
        } else if (target) {
          onExit();
        }
      }

      manualMode.switchTool(nextTool);
    },
    [aiMode, closeOpenLabel, manualMode, mergeTool, onExit],
  );

  // Pen-tool lifecycle: install/exit the InteractivePenHandler reactively.
  // See `usePenTool` for the full state machine and the rationale behind
  // bypassing the no-detection-selected case (legacy first-click path).
  usePenTool({
    scene,
    segmentationModeActive,
    tool: manualMode.tool,
    selectedOverlay: selected?.label.overlay,
  });

  // Auto-enable segmentation mode when a pre-existing mask detection is selected,
  // auto-disable when a pre-existing label of a different type is selected.
  useEffect(() => {
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
    selected?.label.overlay,
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
    const newLabel = createNew(DETECTION);

    if (newLabel?.overlay instanceof DetectionOverlay) {
      newLabel.overlay.initMask();

      // Pen tool: the `overlay-establish` event that normally pushes
      // `AddOverlayCommand` doesn't fire because `onPenPointerDown` doesn't
      // seed the moveStart state. Push it explicitly so the new detection
      // can be undone after the user finishes (or abandons) the polygon.
      // Brush tool reaches establish through the bbox-style drag and pushes
      // the command itself, so we skip it there.
      if (manualMode.tool === SegmentationTool.Pen) {
        CommandContextManager.instance()
          .getActiveContext()
          .pushUndoable(
            new AddOverlayCommand(sceneRef.current!, newLabel.overlay),
          );
      }
    }
  }, [closeOpenLabel, createNew, manualMode.tool]);

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
      manualMode,
      switchTool,
      mergeTool,
    ],
  );
};
