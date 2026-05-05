/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtom, useAtomValue } from "jotai";
import { useRecoilValue } from "recoil";

import { BaseOverlay, useLighter } from "@fiftyone/lighter";
import { isPatchesView } from "@fiftyone/state";
import { DETECTION } from "@fiftyone/utilities";

import { currentType, fieldsOfType, useAnnotationContext } from "./state";
import { useAIAnnotationMode } from "./useAIAnnotationMode";
import useCreate from "./useCreate";
import useExit from "./useExit";

export const DEFAULT_TOOL_SIZE = 16;
export const MIN_TOOL_SIZE = 1;
export const MAX_TOOL_SIZE = 32;
export const MIN_CURSOR_SIZE = 1;
export const MAX_CURSOR_SIZE = 100;

export const SegmentationTool = {
  Select: "select",
  Brush: "brush",
  Pen: "pen",
  AI: "ai",
} as const;
export type SegmentationTool = typeof SegmentationTool[keyof typeof SegmentationTool];

export const SegmentationToolShape = {
  Circle: "circle",
  Square: "square",
} as const;
export type SegmentationToolShape = typeof SegmentationToolShape[keyof typeof SegmentationToolShape];

export const SegmentationToolMode = {
  Add: "add",
  Remove: "remove",
} as const;
export type SegmentationToolMode = typeof SegmentationToolMode[keyof typeof SegmentationToolMode];

export const DEFAULT_TOOL_MODE: SegmentationToolMode = SegmentationToolMode.Add;

export interface SegmentationToolState {
  active: boolean;
  size: number; // World-space dab size (for painting on the mask canvas)
  cursorSize: number; // Screen-pixel cursor size, clamped to [MIN_CURSOR_SIZE, MAX_CURSOR_SIZE]
  tool: SegmentationTool;
  shape: SegmentationToolShape;
  mode: SegmentationToolMode;
}

// ---------------------------------------------------------------------------
// Atoms (internal)
// ---------------------------------------------------------------------------

const segmentationModeActiveAtom = atom<boolean>(false);
const toolAtom = atom<SegmentationTool>(SegmentationTool.Select);
const toolSizeAtom = atom<number>(DEFAULT_TOOL_SIZE);
const toolShapeAtom = atom<SegmentationToolShape>(SegmentationToolShape.Circle);
const toolModeAtom = atom<SegmentationToolMode>(DEFAULT_TOOL_MODE);

// ---------------------------------------------------------------------------
// Unsafe exports for non-React bridge access only.
// Do not use directly in React components — use useSegmentationMode() instead.
// ---------------------------------------------------------------------------

/** @internal */ export { segmentationModeActiveAtom as _unsafeSegmentationModeActiveAtom };
/** @internal */ export { toolAtom as _unsafeToolAtom };
/** @internal */ export { toolSizeAtom as _unsafeToolSizeAtom };
/** @internal */ export { toolShapeAtom as _unsafeToolShapeAtom };
/** @internal */ export { toolModeAtom as _unsafeToolModeAtom };

/**
 * Segmentation mask tool state hook.
 *
 * Selection/editing state is managed by the existing annotation system
 * (editing atom in state.ts, SelectionManager in Lighter).
 * This hook only owns segmentation-specific tool state.
 */
export const useSegmentationMode = () => {
  const { scene, addOverlay } = useLighter();
  const { selectedLabel } = useAnnotationContext();
  const onExit = useExit();
  const isPatchView = useRecoilValue(isPatchesView);
  const fields = useAtomValue(fieldsOfType(DETECTION));

  const [segmentationModeActive, setSegmentationModeActive] = useAtom(
    segmentationModeActiveAtom
  );
  const [tool, setTool] = useAtom(toolAtom);
  const [toolSize, setToolSizeRaw] = useAtom(toolSizeAtom);
  const [toolShape, setToolShape] = useAtom(toolShapeAtom);
  const [toolMode, setToolMode] = useAtom(toolModeAtom);

  // AI detection
  const aiMode = useAIAnnotationMode();

  const createDetection = useCreate(DETECTION);
  const editingLabelType = useAtomValue(currentType);

  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

  const isEditingSegmentation =
    editingLabelType === DETECTION &&
    (!!selectedLabel?.data?.mask || !!selectedLabel?.data?.isEditingMask);

  const noActiveFields = fields.length === 0;
  const disabled = isPatchView || noActiveFields;

  const tooltip = isPatchView
    ? "Creating masks is not supported in this view"
    : noActiveFields
    ? "No active fields"
    : segmentationModeActive
    ? "Exit mask creation"
    : "Create new mask";

  // -----------------------  Manual segmentation tools  ------------------- //

  const switchTool = useCallback(
    (newTool: SegmentationTool) => {
      setTool(newTool);
    },
    [setTool]
  );

  const increaseToolSize = useCallback(() => {
    setToolSizeRaw((prev) => Math.min(prev + 1, MAX_TOOL_SIZE));
  }, [setToolSizeRaw]);

  const decreaseToolSize = useCallback(() => {
    setToolSizeRaw((prev) => Math.max(prev - 1, MIN_TOOL_SIZE));
  }, [setToolSizeRaw]);

  const setToolSize = useCallback(
    (size: number) => {
      const n = Number(size);
      if (Number.isNaN(n)) return;
      setToolSizeRaw(Math.max(MIN_TOOL_SIZE, Math.min(n, MAX_TOOL_SIZE)));
    },
    [setToolSizeRaw]
  );

  const switchToolShape = useCallback(
    (shape: SegmentationToolShape) => {
      setToolShape(shape);
    },
    [setToolShape]
  );

  const switchToolMode = useCallback(
    (mode: SegmentationToolMode) => {
      setToolMode(mode);
    },
    [setToolMode]
  );

  // ------------------------  AI segmentation handling  ------------------- //

  // Activate/deactivate AI point selection when switching to/from the AI tool.
  useEffect(() => {
    if (!segmentationModeActive) return;

    if (tool === SegmentationTool.AI) {
      aiMode.activate();
    } else if (aiMode.isActive) {
      aiMode.deactivate();
    }
  }, [tool, segmentationModeActive, aiMode]);

  // ---------------  Segmentation mode activation / deactivation  --------- //

  const activateSegmentationMode = useCallback(() => {
    setSegmentationModeActive(true);
  }, [setSegmentationModeActive]);

  /**
   * Disable segmentation mode and gracefully close out any label being edited.
   */
  const deactivateSegmentationMode = useCallback(() => {
    const currentScene = sceneRef.current;
    currentScene?.exitInteractiveMode();
    onExit();

    aiMode.deactivate();

    setSegmentationModeActive(false);
  }, [aiMode, onExit, setSegmentationModeActive]);

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

  // Auto-enable segmentation mode when a pre-existing mask detection is selected,
  // auto-disable when a pre-existing label of a different type is selected.
  //
  // New labels are ignored — the mode was set intentionally via the toolbar button.
  //
  // Exception: when the AI tool produces a new detection, select its overlay in
  // Lighter so the SelectionManager and rendering pipeline treat it as active.
  useEffect(() => {
    if (selectedLabel?.isNew) {
      if (
        segmentationModeActive &&
        tool === SegmentationTool.AI &&
        selectedLabel.overlay
      ) {
        scene?.selectOverlay(selectedLabel.overlay.id);
      }
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
    tool,
    scene,
  ]);

  // -----------------------------  Mode actions  -------------------------- //

  /**
   * Finalize the previous mask detection (if any) and start a new one.
   */
  const create = useCallback(() => {
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

    // TODO: assume previous `field` and `labelValue`
    // e.g. createDetection({ field, labelValue, isEditingMask: true });
    createDetection({ isEditingMask: true });
  }, [addOverlay, createDetection]);

  /**
   * Accept the current AI mask, tear down point selection, and switch to the
   * brush so the user can refine the mask manually. The overlay stays
   * selected and in editing mode.
   */
  const finalizePointSelection = useCallback(() => {
    aiMode.deactivate();
    setTool("brush");
  }, [aiMode, setTool]);

  // ----------------------------  Public interface  ----------------------- //

  return useMemo(
    () => ({
      // State (read-only)
      segmentationModeActive,
      disabled,
      tooltip,

      // Mode control
      activateSegmentationMode,
      deactivateSegmentationMode,
      toggleSegmentationMode,

      // Bridge actions (wired to Lighter events by `useBridge`)
      create,
      finalizePointSelection,

      // Tool state
      tool,
      toolSize,
      toolShape,
      toolMode,
      switchTool,
      switchToolShape,
      switchToolMode,
      increaseToolSize,
      decreaseToolSize,
      setToolSize,
    }),
    [
      segmentationModeActive,
      disabled,
      tooltip,
      activateSegmentationMode,
      deactivateSegmentationMode,
      toggleSegmentationMode,
      create,
      finalizePointSelection,
      tool,
      toolSize,
      toolShape,
      toolMode,
      switchTool,
      switchToolShape,
      switchToolMode,
      increaseToolSize,
      decreaseToolSize,
      setToolSize,
    ]
  );
};
