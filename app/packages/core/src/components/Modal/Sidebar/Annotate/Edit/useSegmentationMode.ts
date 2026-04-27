/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useRecoilValue } from "recoil";

import {
  AgentTaskType,
  NEGATIVE_POINT_VARIANT,
  PointSelectionVariant,
  POSITIVE_POINT_VARIANT,
  useActiveTask,
  useAgentSelector,
  usePointSelection,
  useToolsState,
} from "@fiftyone/annotation/src/agents";
import {
  BaseOverlay,
  DetectionOverlay,
  KeypointPointHitAction,
  Point,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { isPatchesView } from "@fiftyone/state";
import { DETECTION, ClickEventModifiers } from "@fiftyone/utilities";

import { currentType, fieldsOfType, useAnnotationContext } from "./state";
import useCreate from "./useCreate";
import useExit from "./useExit";

export const DEFAULT_TOOL_SIZE = 16;
export const MIN_TOOL_SIZE = 1;
export const MAX_TOOL_SIZE = 32;
export const MIN_CURSOR_SIZE = 1;
export const MAX_CURSOR_SIZE = 100;

export type SegmentationTool = "select" | "brush" | "eraser" | "pen" | "ai";
export type SegmentationToolShape = "circle" | "square";

export interface SegmentationToolState {
  active: boolean;
  size: number; // World-space dab size (for painting on the mask canvas)
  cursorSize: number; // Screen-pixel cursor size, clamped to [MIN_CURSOR_SIZE, MAX_CURSOR_SIZE]
  tool: SegmentationTool;
  shape: SegmentationToolShape;
}

// ---------------------------------------------------------------------------
// Atoms (internal)
// ---------------------------------------------------------------------------

const segmentationModeActiveAtom = atom<boolean>(false);
const toolAtom = atom<SegmentationTool>("select");
const toolSizeAtom = atom<number>(DEFAULT_TOOL_SIZE);
const toolShapeAtom = atom<SegmentationToolShape>("circle");

/**
 * Tracks the last processed event ID for each event type so that only one
 * `useSegmentationMode` instance handles each event, even though the hook is
 * called in multiple components.
 */
const claimedEventsAtom = atom<Map<string, string>>(new Map());

// ---------------------------------------------------------------------------
// Unsafe exports for non-React bridge access only.
// Do not use directly in React components — use useSegmentationMode() instead.
// ---------------------------------------------------------------------------

/** @internal */ export { segmentationModeActiveAtom as _unsafeSegmentationModeActiveAtom };
/** @internal */ export { toolAtom as _unsafeToolAtom };
/** @internal */ export { toolSizeAtom as _unsafeToolSizeAtom };
/** @internal */ export { toolShapeAtom as _unsafeToolShapeAtom };

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
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const [segmentationModeActive, setSegmentationModeActive] = useAtom(
    segmentationModeActiveAtom
  );
  const [tool, setTool] = useAtom(toolAtom);
  const [toolSize, setToolSizeRaw] = useAtom(toolSizeAtom);
  const [toolShape, setToolShape] = useAtom(toolShapeAtom);

  // AI detection
  const agentSelector = useAgentSelector();
  const { setActiveTask } = useActiveTask();
  const { reset: resetToolsState } = useToolsState();
  const pointSelection = usePointSelection();

  const createDetection = useCreate(DETECTION);
  const editingLabelType = useAtomValue(currentType);

  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

  const previousSelectedLabelIdRef = useRef<string | null>(
    selectedLabel?.overlay?.id ?? null
  );

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

  // ------------------------  AI segmentation handling  ------------------- //

  // We don't currently expose agent selection capabilities in the UX.
  // Select the first available agent once the agents have resolved.
  useEffect(() => {
    if (agentSelector.isResolved && !agentSelector.activeAgent) {
      agentSelector.setActiveAgent(agentSelector.agents[0]);
    }
  }, [agentSelector]);

  // When the user commits/exits a label (selected label transitions away
  // from a populated overlay), wipe the inference prompt points so the next
  // label starts from a clean slate. We stay in segmentation mode.
  useEffect(() => {
    if (!segmentationModeActive) {
      previousSelectedLabelIdRef.current = selectedLabel?.overlay?.id ?? null;
      return;
    }

    const previousId = previousSelectedLabelIdRef.current;
    const currentId = selectedLabel?.overlay?.id ?? null;

    if (previousId && previousId !== currentId) {
      pointSelection.clearPoints();
      resetToolsState();
    }

    previousSelectedLabelIdRef.current = currentId;
  }, [selectedLabel]);

  // Points placed on the current label's mask are interpreted as negative;
  // points placed off-mask are positive.
  // Holding shift inverts the result.
  const resolvePointVariant = useCallback(
    (
      relativePoint: Point,
      { shiftKey }: ClickEventModifiers
    ): PointSelectionVariant => {
      const label = selectedLabelRef.current;
      const onMask =
        label && label.overlay instanceof DetectionOverlay
          ? label.overlay.containsMaskPixel(relativePoint)
          : false;

      const variant = onMask ? NEGATIVE_POINT_VARIANT : POSITIVE_POINT_VARIANT;

      return !shiftKey
        ? // normal variant if shift key is not pressed
          variant
        : // otherwise invert the variant
        variant === POSITIVE_POINT_VARIANT
        ? NEGATIVE_POINT_VARIANT
        : POSITIVE_POINT_VARIANT;
    },
    []
  );

  // Clicking an existing point deletes it
  const resolvePointHit = useCallback(() => KeypointPointHitAction.DELETE, []);

  // Activate/deactivate AI point selection when switching to/from the AI tool.
  useEffect(() => {
    if (!segmentationModeActive) return;

    if (tool === "ai") {
      setActiveTask(AgentTaskType.SEGMENT);
      pointSelection.activate(resolvePointVariant, resolvePointHit);
    } else if (pointSelection.isActive) {
      pointSelection.deactivate();
      resetToolsState();
      setActiveTask(null);
    }
  }, [
    tool,
    segmentationModeActive,
    pointSelection,
    resolvePointVariant,
    resolvePointHit,
    setActiveTask,
    resetToolsState,
  ]);

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

    pointSelection.deactivate();
    resetToolsState();
    setActiveTask(null);

    setSegmentationModeActive(false);
  }, [
    onExit,
    pointSelection,
    resetToolsState,
    setActiveTask,
    setSegmentationModeActive,
  ]);

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
      if (segmentationModeActive && tool === "ai" && selectedLabel.overlay) {
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

  // -----------------------------  Event handling  ------------------------ //

  const claimEvent = useAtomCallback(
    useCallback((get, set, eventType: string, eventId: string) => {
      const claimedEvents = get(claimedEventsAtom);
      if (claimedEvents.get(eventType) === eventId) {
        return false;
      }

      const updatedEvents = new Map(claimedEvents);
      updatedEvents.set(eventType, eventId);
      set(claimedEventsAtom, updatedEvents);

      return true;
    }, [])
  );

  /**
   * Handles the `lighter:overlay-create` event fired by `InteractionManager`
   * on pointer-down when no interactive handler exists.
   *
   * 1. Finalize the previous detection (exit interactive mode, persist overlay,
   *    remember field/label for auto-assignment).
   * 2. Resolve field and label for the next detection.
   * 3. Create the next detection.
   */
  useEventHandler(
    "lighter:overlay-create",
    useCallback(
      (payload) => {
        if (
          !segmentationModeActive ||
          !claimEvent("overlay-create", payload.eventId)
        ) {
          return;
        }

        // Finalize the previous detection if one exists
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
      },
      [addOverlay, claimEvent, createDetection, segmentationModeActive]
    )
  );

  /**
   * Handles the `lighter:segmentation-mode-quit` event fired by
   * `InteractionManager` when the user clicks with the "select" tool active.
   * Deactivates segmentation mode entirely.
   */
  useEventHandler(
    "lighter:segmentation-mode-quit",
    useCallback(
      (payload) => {
        if (
          !segmentationModeActive ||
          !claimEvent("segmentation-mode-exit", payload.eventId)
        ) {
          return;
        }

        deactivateSegmentationMode();
      },
      [claimEvent, deactivateSegmentationMode, segmentationModeActive]
    )
  );

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

      // Tool state
      tool,
      toolSize,
      toolShape,
      switchTool,
      switchToolShape,
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
      tool,
      toolSize,
      toolShape,
      switchTool,
      switchToolShape,
      increaseToolSize,
      decreaseToolSize,
      setToolSize,
    ]
  );
};
