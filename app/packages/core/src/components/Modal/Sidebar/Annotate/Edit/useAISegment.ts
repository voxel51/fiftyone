/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Hook for AI-assisted segmentation mode.
 *
 * Flow:
 *  1. User enters AI segment mode → point overlay created
 *  2. User types text prompt → interactive mode activated
 *  3. User clicks canvas → positive point placed → inference triggered
 *  4. First result → pending Detection overlay created with mask + bbox
 *  5. More points → inference re-triggered → same Detection overlay updated
 *  6. User configures field/class in sidebar → confirms label
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { getEventBus } from "@fiftyone/events";

import {
  type AISegmentPointOverlay,
  type BoundingBoxOverlay,
  type BoundingBoxOptions,
  type KeypointOptions,
  type LighterEventGroup,
  InteractiveKeypointHandler,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import type { AnnotationLabel } from "@fiftyone/state";
import { useToolsState } from "@fiftyone/annotation/src/agents/hooks/useToolsContext";
import { useActiveTask } from "@fiftyone/annotation/src/agents/hooks/useActiveTask";
import { useAgentSelector } from "@fiftyone/annotation/src/agents/hooks/useAgentSelector";
import { useAgentRegistry } from "@fiftyone/annotation/src/agents/hooks/useAgentRegistry";
import { useAnnotationAgent } from "@fiftyone/annotation/src/agents/hooks/useAnnotationAgent";
import { OperatorAnnotationAgent } from "@fiftyone/annotation/src/agents/OperatorAnnotationAgent";
import {
  AgentTaskType,
  type InferenceResult,
  type SegmentationInferenceResult,
} from "@fiftyone/annotation/src/agents/types";
import { DETECTION, objectId } from "@fiftyone/utilities";
import { v4 as generateUUID } from "uuid";
import { defaultField, editing, savedLabel } from "./state";
import { useAnnotationContext } from "./state";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AI_SEGMENT_OPERATOR_URI = "@voxel51/annotation/segment";
const AI_SEGMENT_AGENT_ID = "ai-segment-operator";

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

const aiSegmentActiveAtom = atom<boolean>(false);
const aiSegmentOverlayIdAtom = atom<string | null>(null);
const pendingDetectionIdAtom = atom<string | null>(null);
/** Whether the agent has been registered in this session */
const agentRegisteredAtom = atom<boolean>(false);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useAISegment = () => {
  const { scene, addOverlay, removeOverlay, overlayFactory, getOverlay } =
    useLighter();
  const toolsState = useToolsState();
  const { setActiveTask } = useActiveTask();
  const { activeAgent, setActiveAgent } = useAgentSelector();
  const registry = useAgentRegistry();
  const resolvedAgent = useAnnotationAgent(activeAgent?.agent);
  const { selectedLabel } = useAnnotationContext();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const resolvedAgentRef = useRef(resolvedAgent);
  resolvedAgentRef.current = resolvedAgent;

  const active = useAtomValue(aiSegmentActiveAtom);
  const overlayId = useAtomValue(aiSegmentOverlayIdAtom);
  const setActive = useSetAtom(aiSegmentActiveAtom);
  const setOverlayId = useSetAtom(aiSegmentOverlayIdAtom);
  const setEditing = useSetAtom(editing);
  const setPendingDetectionId = useSetAtom(pendingDetectionIdAtom);

  const getAgentRegistered = useAtomCallback(
    useCallback((get) => get(agentRegisteredAtom), [])
  );
  const setAgentRegistered = useSetAtom(agentRegisteredAtom);

  // ---- lazy agent registration (on first point, not on enter) ----

  const ensureAgent = useCallback(async () => {
    if (getAgentRegistered()) return;

    const agent = new OperatorAnnotationAgent<SegmentationInferenceResult>(
      AI_SEGMENT_OPERATOR_URI
    );
    await registry.register(AI_SEGMENT_AGENT_ID, "AI Segment", agent);
    setActiveAgent({ id: AI_SEGMENT_AGENT_ID, label: "AI Segment", agent });
    setAgentRegistered(true);
  }, [registry, setActiveAgent, getAgentRegistered, setAgentRegistered]);

  // ---- enter / exit ----

  const enter = useCallback(() => {
    const currentScene = sceneRef.current;
    if (!currentScene || !overlayFactory) return;

    setActiveTask(AgentTaskType.SEGMENT);
    setActive(true);

    const id = `ai-segment-points-${generateUUID()}`;
    const overlay = overlayFactory.create<
      Omit<KeypointOptions, "connections" | "closed">,
      AISegmentPointOverlay
    >("ai-segment-point", {
      id,
      field: "",
      label: { id, label: "", tags: [], points: [] } as any,
    });

    addOverlay(overlay, false);
    setOverlayId(id);
  }, [overlayFactory, addOverlay, setActive, setActiveTask, setOverlayId]);

  const exit = useCallback(() => {
    const currentScene = sceneRef.current;
    if (currentScene && !currentScene.isDestroyed) {
      currentScene.exitInteractiveMode();
    }

    const currentOverlayId = overlayId;
    if (currentOverlayId) {
      removeOverlay(currentOverlayId, false);
    }

    toolsState.reset();
    setActiveTask(null);
    setActive(false);
    setOverlayId(null);
    setPendingDetectionId(null);
  }, [
    overlayId,
    removeOverlay,
    toolsState,
    setActiveTask,
    setActive,
    setOverlayId,
    setPendingDetectionId,
  ]);

  // ---- text prompt ----

  const prompt = toolsState.textPrompt ?? "";

  const setPrompt = useCallback(
    (text: string) => {
      toolsState.setTextPrompt(text);
    },
    [toolsState]
  );

  // ---- enter interactive mode only when prompt is non-empty ----

  const interactiveModeRef = useRef(false);

  useEffect(() => {
    const currentScene = sceneRef.current;
    if (!currentScene || currentScene.isDestroyed || !active) return;

    const hasPrompt = prompt.length > 0;

    if (hasPrompt && !interactiveModeRef.current && overlayId) {
      const overlay = getOverlay?.(overlayId);
      if (overlay) {
        const eventBus = getEventBus<LighterEventGroup>(
          currentScene.getEventChannel()
        );
        const handler = new InteractiveKeypointHandler(
          overlay as AISegmentPointOverlay,
          eventBus
        );
        currentScene.enterInteractiveMode(handler);
        interactiveModeRef.current = true;
      }
    } else if (!hasPrompt && interactiveModeRef.current) {
      currentScene.exitInteractiveMode();
      interactiveModeRef.current = false;
    }
  }, [active, prompt, overlayId, getOverlay]);

  useEffect(() => {
    if (!active) {
      interactiveModeRef.current = false;
    }
  }, [active]);

  // ---- apply inference result ----

  const getPendingDetectionId = useAtomCallback(
    useCallback((get) => get(pendingDetectionIdAtom), [])
  );

  const applyResult = useCallback(
    (result: InferenceResult<SegmentationInferenceResult>) => {
      if (result.type !== "sync") {
        console.warn("[AI Segment] Async results not yet supported");
        return;
      }

      const detection = result.response?.detections?.[0];
      if (!detection) {
        console.warn("[AI Segment] No detection in inference result");
        return;
      }

      // (a) Existing label selected → update its mask in-place
      if (selectedLabel && "bounding_box" in selectedLabel.data) {
        const overlay = getOverlay?.(selectedLabel.data._id) as
          | BoundingBoxOverlay
          | undefined;
        if (overlay) {
          overlay.updateLabel({
            ...overlay.label,
            bounding_box: detection.bounding_box ?? overlay.label.bounding_box,
            mask: detection.mask,
          });
          overlay.markDirty();
          return;
        }
      }

      // (b) Pending detection from a previous inference → update it
      const existingId = getPendingDetectionId();
      const existingOverlay = existingId
        ? (getOverlay?.(existingId) as BoundingBoxOverlay | undefined)
        : undefined;

      if (existingOverlay) {
        existingOverlay.updateLabel({
          ...existingOverlay.label,
          label: detection.label || existingOverlay.label.label,
          bounding_box: detection.bounding_box,
          mask: detection.mask,
        });
        existingOverlay.markDirty();
      } else {
        // (c) First inference → create new pending Detection
        if (!overlayFactory || !scene) return;

        const store = getDefaultStore();
        const id = objectId();
        const field = store.get(defaultField(DETECTION)) ?? undefined;
        if (!field) {
          console.warn("[AI Segment] No detection field available");
          return;
        }

        const labelValue = detection.label || toolsState.textPrompt || "object";

        const labelData: DetectionLabel = {
          _id: id,
          _cls: "Detection",
          label: labelValue,
          bounding_box: detection.bounding_box,
          mask: detection.mask,
          tags: [],
        } as any;

        const overlay = overlayFactory.create<
          BoundingBoxOptions,
          BoundingBoxOverlay
        >("bounding-box", {
          id,
          field,
          label: labelData,
          draggable: true,
          resizeable: true,
        });

        const bb = detection.bounding_box;
        if (bb && bb.length === 4) {
          const cs = scene.getCoordinateSystem();
          if (cs) {
            const t = cs.getTransform();
            overlay.bounds = {
              x: t.offsetX + bb[0] * t.scaleX,
              y: t.offsetY + bb[1] * t.scaleY,
              width: bb[2] * t.scaleX,
              height: bb[3] * t.scaleY,
            };
          }
        }

        addOverlay(overlay);
        setPendingDetectionId(id);

        store.set(savedLabel, labelData);
        setEditing(
          atom<AnnotationLabel>({
            isNew: true,
            data: labelData,
            overlay,
            path: field,
            type: DETECTION,
          })
        );
      }
    },
    [
      overlayFactory,
      scene,
      addOverlay,
      getOverlay,
      getPendingDetectionId,
      selectedLabel,
      setPendingDetectionId,
      setEditing,
      toolsState,
    ]
  );

  const applyResultRef = useRef(applyResult);
  applyResultRef.current = applyResult;

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

        const overlay = getOverlay?.(currentOverlayId);
        if (!overlay || !("getRelativePoints" in overlay)) return;

        const keypointOverlay = overlay as AISegmentPointOverlay;
        const relativePoints = keypointOverlay.getRelativePoints();
        const newPoint = relativePoints[payload.pointIndex];
        if (!newPoint) return;

        // Update tools state so AnnotationContext stays in sync
        toolsState.addPositivePoint(newPoint);

        // Register agent lazily on first point, then infer.
        // Use queueMicrotask to let Jotai flush the addPositivePoint
        // state update before resolvedAgent.infer() reads the context.
        ensureAgent().then(() => {
          queueMicrotask(() => {
            const agent = resolvedAgentRef.current;
            if (agent) {
              agent
                .infer()
                .then((result) => {
                  keypointOverlay.stopProcessing();
                  if (result) applyResultRef.current(result);
                })
                .catch((err) => {
                  console.error("[AI Segment] Inference failed:", err);
                  keypointOverlay.stopProcessing();
                });
            } else {
              keypointOverlay.stopProcessing();
            }
          });
        });
      },
      [getOverlay, getOverlayId, toolsState, ensureAgent]
    )
  );

  useEventHandler(
    "lighter:keypoint-point-deleted",
    useCallback(
      (payload) => {
        const currentOverlayId = getOverlayId();
        if (!currentOverlayId || payload.id !== currentOverlayId) return;

        const overlay = getOverlay?.(currentOverlayId) as
          | AISegmentPointOverlay
          | undefined;
        if (!overlay) return;

        toolsState.removePositivePoint(payload.pointIndex);

        const points = overlay.getRelativePoints();
        if (points.length > 0) {
          overlay.startProcessing(points.length - 1);

          queueMicrotask(() => {
            const agent = resolvedAgentRef.current;
            if (agent) {
              agent
                .infer()
                .then((result) => {
                  overlay.stopProcessing();
                  if (result) applyResultRef.current(result);
                })
                .catch((err) => {
                  console.error("[AI Segment] Inference failed:", err);
                  overlay.stopProcessing();
                });
            }
          });
        }
      },
      [getOverlay, getOverlayId, toolsState]
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
