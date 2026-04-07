/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useRecoilValue } from "recoil";

import {
  BaseOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { isPatchesView } from "@fiftyone/state";
import { DETECTION } from "@fiftyone/utilities";

import { currentType, fieldsOfType, useAnnotationContext } from "./state";
import useCreate from "./useCreate";
import useExit from "./useExit";

export const DEFAULT_TOOL_SIZE = 16;
export const MIN_TOOL_SIZE = 1;
export const MAX_TOOL_SIZE = 32;

export type SegmentationTool = "select" | "brush" | "eraser"; // | "pen";
export type SegmentationToolShape = "circle" | "square";

export interface SegmentationToolState {
  active: boolean;
  size: number;
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
 * Tracks the last processed `lighter:overlay-create` event ID so that only one
 * `useSegmentationMode` instance handles each event, even though the hook is
 * called in multiple components.
 */
const lastProcessedCreateIdAtom = atom<string | null>(null);

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

  // Using refs to prevent shared closure contexts from retaining old Scene2D instances.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

  const segmentationModeActive = useAtomValue(segmentationModeActiveAtom);
  const tool = useAtomValue(toolAtom);
  const toolSize = useAtomValue(toolSizeAtom);
  const toolShape = useAtomValue(toolShapeAtom);

  const setActive = useSetAtom(segmentationModeActiveAtom);
  const setTool = useSetAtom(toolAtom);
  const setToolSizeRaw = useSetAtom(toolSizeAtom);
  const setToolShape = useSetAtom(toolShapeAtom);

  const createDetection = useCreate(DETECTION);
  const editingLabelType = useAtomValue(currentType);

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

  const activateSegmentationMode = useCallback(() => {
    setActive(true);
  }, [setActive]);

  /**
   * Disable segmentation mode and gracefully close out any label being edited.
   */
  const deactivateSegmentationMode = useCallback(() => {
    const currentScene = sceneRef.current;
    currentScene?.exitInteractiveMode();
    onExit();
    setActive(false);
    setTool("select");
  }, [onExit, setActive, setTool]);

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

  // Auto-enable segmentation mode when a pre-existing mask detection is selected,
  // auto-disable when a pre-existing label of a different type is selected.
  // New labels are ignored — the mode was set intentionally via the toolbar button.
  useEffect(() => {
    if (selectedLabel?.isNew) return;

    if (isEditingSegmentation && !segmentationModeActive) {
      setActive(true);
    } else if (
      editingLabelType &&
      !isEditingSegmentation &&
      segmentationModeActive
    ) {
      setActive(false);
    }
  }, [
    selectedLabel?.isNew,
    editingLabelType,
    isEditingSegmentation,
    segmentationModeActive,
    setActive,
  ]);

  const claimCreateEvent = useAtomCallback(
    useCallback((get, set, eventId: string) => {
      if (get(lastProcessedCreateIdAtom) === eventId) {
        return false;
      }

      set(lastProcessedCreateIdAtom, eventId);

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
        if (!segmentationModeActive || !claimCreateEvent(payload.eventId)) {
          return;
        }

        // Finalize the previous detection if one exists
        const currentScene = sceneRef.current;
        const currentLabel = selectedLabelRef.current;

        if (currentLabel) {
          if (
            currentScene &&
            !currentScene.isDestroyed &&
            currentScene.renderLoopActive
          ) {
            currentScene.exitInteractiveMode();

            if (currentLabel.overlay) {
              addOverlay(currentLabel.overlay as BaseOverlay);
            }
          }
        }

        // TODO: assume previous `field` and `labelValue`
        // e.g. createDetection({ field, labelValue, isEditingMask: true });
        createDetection({ isEditingMask: true });
      },
      [addOverlay, claimCreateEvent, createDetection, segmentationModeActive]
    )
  );

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
