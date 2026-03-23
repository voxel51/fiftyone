/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useMemo, useRef } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";

import {
  BaseOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useAnnotationContext } from "./state";
import { DETECTION } from "@fiftyone/utilities";
import useCreate from "./useCreate";

export const DEFAULT_TOOL_SIZE = 16;
export const MIN_TOOL_SIZE = 1;
export const MAX_TOOL_SIZE = 32;

export type SegmentationTool = "select" | "brush" | "eraser"; // | "pen";
export type SegmentationToolShape = "circle" | "square";

export interface SegmentationToolData {
  size: number;
  tool: SegmentationTool;
  shape: SegmentationToolShape;
}

// ---------------------------------------------------------------------------
// Atoms (internal)
// ---------------------------------------------------------------------------

const segmentationActiveAtom = atom<boolean>(false);
const toolAtom = atom<SegmentationTool>("select");
const toolSizeAtom = atom<number>(DEFAULT_TOOL_SIZE);
const toolShapeAtom = atom<SegmentationToolShape>("circle");

/**
 * Tracks the last processed `lighter:overlay-create` event ID so that only one
 * `useSegmentationMasks` instance handles each event, even though the hook is
 * called in multiple components.
 */
const lastProcessedCreateIdAtom = atom<string | null>(null);

// ---------------------------------------------------------------------------
// Unsafe exports for non-React bridge access only.
// Do not use directly in React components — use useSegmentationMasks() instead.
// ---------------------------------------------------------------------------

/** @internal */ export { segmentationActiveAtom as _unsafeSegmentationActiveAtom };
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
export const useSegmentationMasks = () => {
  const { scene, addOverlay } = useLighter();
  const { selectedLabel } = useAnnotationContext();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  // Using refs to prevent shared closure contexts from retaining old Scene2D instances.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

  const segmentationActive = useAtomValue(segmentationActiveAtom);
  const tool = useAtomValue(toolAtom);
  const toolSize = useAtomValue(toolSizeAtom);
  const toolShape = useAtomValue(toolShapeAtom);

  const setActive = useSetAtom(segmentationActiveAtom);
  const setTool = useSetAtom(toolAtom);
  const setToolSizeRaw = useSetAtom(toolSizeAtom);
  const setToolShape = useSetAtom(toolShapeAtom);

  const createDetection = useCreate(DETECTION);

  const enter = useCallback(() => {
    setActive(true);
  }, [setActive]);

  const exit = useCallback(() => {
    setActive(false);
    setTool("select");
  }, [setActive, setTool]);

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
      setToolSizeRaw(Math.max(MIN_TOOL_SIZE, Math.min(size, MAX_TOOL_SIZE)));
    },
    [setToolSizeRaw]
  );

  const switchToolShape = useCallback(
    (shape: SegmentationToolShape) => {
      setToolShape(shape);
    },
    [setToolShape]
  );

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
        if (!segmentationActive || !claimCreateEvent(payload.eventId)) {
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
        // e.g. createDetection({ field, labelValue });
        createDetection();
      },
      [claimCreateEvent, segmentationActive]
    )
  );

  return useMemo(
    () => ({
      active: segmentationActive,
      tool,
      toolSize,
      toolShape,
      enter,
      exit,
      switchTool,
      switchToolShape,
      increaseToolSize,
      decreaseToolSize,
      setToolSize,
    }),
    [
      segmentationActive,
      tool,
      toolSize,
      toolShape,
      enter,
      exit,
      switchTool,
      switchToolShape,
      increaseToolSize,
      decreaseToolSize,
      setToolSize,
    ]
  );
};
