/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Hook for AI-assisted segmentation mode.
 *
 * Manages the lifecycle of placing positive prompt-points on the canvas
 * and wiring them to the annotation agent inference pipeline.
 */

import { useCallback, useMemo, useRef } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { getEventBus } from "@fiftyone/events";

import {
  type AISegmentPointOverlay,
  type KeypointOptions,
  type LighterEventGroup,
  InteractiveKeypointHandler,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import {
  useToolsState,
  useActiveTask,
  useAgentSelector,
  useAnnotationAgent,
  useApplyInferenceResult,
  AgentTaskType,
} from "@fiftyone/annotation";
import { v4 as generateUUID } from "uuid";

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

const aiSegmentActiveAtom = atom<boolean>(false);
const aiSegmentOverlayIdAtom = atom<string | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useAISegment = () => {
  const { scene, addOverlay, removeOverlay, overlayFactory, getOverlay } =
    useLighter();
  const toolsState = useToolsState();
  const { setActiveTask } = useActiveTask();
  const { activeAgent } = useAgentSelector();
  const resolvedAgent = useAnnotationAgent(activeAgent?.agent);
  const applyResult = useApplyInferenceResult();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  // Refs for stale-closure safety in event callbacks
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const resolvedAgentRef = useRef(resolvedAgent);
  resolvedAgentRef.current = resolvedAgent;
  const applyResultRef = useRef(applyResult);
  applyResultRef.current = applyResult;

  const active = useAtomValue(aiSegmentActiveAtom);
  const overlayId = useAtomValue(aiSegmentOverlayIdAtom);
  const setActive = useSetAtom(aiSegmentActiveAtom);
  const setOverlayId = useSetAtom(aiSegmentOverlayIdAtom);

  // ---- enter / exit ----

  const enter = useCallback(() => {
    const currentScene = sceneRef.current;
    if (!currentScene || !overlayFactory) return;

    setActiveTask(AgentTaskType.SEGMENT);
    setActive(true);

    // Create the point overlay
    const id = `ai-segment-points-${generateUUID()}`;
    const overlay = overlayFactory.create<
      Omit<KeypointOptions, "connections" | "closed">,
      AISegmentPointOverlay
    >("ai-segment-point", {
      id,
      field: "",
      label: { _id: id, label: "", tags: [], points: [] },
    });

    addOverlay(overlay, false);
    setOverlayId(id);

    // Enter interactive mode so every click places a point
    const eventBus = getEventBus<LighterEventGroup>(
      currentScene.getEventChannel()
    );
    const handler = new InteractiveKeypointHandler(overlay, eventBus);
    currentScene.enterInteractiveMode(handler);
  }, [overlayFactory, addOverlay, setActive, setActiveTask, setOverlayId]);

  const exit = useCallback(() => {
    const currentScene = sceneRef.current;
    if (currentScene && !currentScene.isDestroyed) {
      currentScene.exitInteractiveMode();
    }

    // Get overlay ID before resetting
    const currentOverlayId = overlayId;
    if (currentOverlayId) {
      removeOverlay(currentOverlayId, false);
    }

    toolsState.reset();
    setActiveTask(null);
    setActive(false);
    setOverlayId(null);
  }, [
    overlayId,
    removeOverlay,
    toolsState,
    setActiveTask,
    setActive,
    setOverlayId,
  ]);

  // ---- text prompt ----

  const prompt = toolsState.textPrompt ?? "";

  const setPrompt = useCallback(
    (text: string) => {
      toolsState.setTextPrompt(text || null);
    },
    [toolsState]
  );

  // ---- point events → inference ----

  const getOverlayId = useAtomCallback(
    useCallback((get) => get(aiSegmentOverlayIdAtom), [])
  );

  useEventHandler(
    "lighter:keypoint-point-added",
    useCallback(
      (payload) => {
        const currentOverlayId = getOverlayId();
        if (!currentOverlayId || payload.id !== currentOverlayId) return;

        // Get relative [0,1] coordinates from the overlay
        const overlay = getOverlay?.(currentOverlayId);
        if (!overlay || !("getRelativePoints" in overlay)) return;

        const keypointOverlay = overlay as AISegmentPointOverlay;
        const relativePoints = keypointOverlay.getRelativePoints();
        const newPoint = relativePoints[payload.pointIndex];
        if (!newPoint) return;

        // Feed into tools state → AnnotationContext
        toolsState.addPositivePoint(newPoint);

        // Trigger inference
        const agent = resolvedAgentRef.current;
        const apply = applyResultRef.current;
        if (agent) {
          agent.infer().then((result) => {
            if (result) apply(result);
          });
        }
      },
      [getOverlay, getOverlayId, toolsState]
    )
  );

  useEventHandler(
    "lighter:keypoint-point-deleted",
    useCallback(
      (payload) => {
        const currentOverlayId = getOverlayId();
        if (!currentOverlayId || payload.id !== currentOverlayId) return;

        toolsState.removePositivePoint(payload.pointIndex);

        // Re-infer with updated point set
        const agent = resolvedAgentRef.current;
        const apply = applyResultRef.current;
        if (agent) {
          agent.infer().then((result) => {
            if (result) apply(result);
          });
        }
      },
      [getOverlayId, toolsState]
    )
  );

  // ---- return ----

  return useMemo(
    () => ({
      active,
      prompt,
      setPrompt,
      enter,
      exit,
    }),
    [active, prompt, setPrompt, enter, exit]
  );
};
