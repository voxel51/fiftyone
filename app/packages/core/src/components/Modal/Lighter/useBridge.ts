/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  AnnotationEventGroup,
  DeleteAnnotationCommand,
  getFieldSchema,
  useAnnotationEventBus,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import {
  DetectionOverlay,
  type LighterEventGroup,
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  UpdateLabelCommand,
  useLighterEventBus,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import { editing } from "../Sidebar/Annotate/Edit";
import {
  current,
  currentData,
  savedLabel,
} from "../Sidebar/Annotate/Edit/state";
import { useDetectionMode } from "../Sidebar/Annotate/Edit/useDetectionMode";
import {
  usePolylineMode,
  usePolylineModeInstaller,
} from "../Sidebar/Annotate/Edit/usePolylineMode";
import {
  SegmentationTool,
  useSegmentationMode,
} from "../Sidebar/Annotate/Edit/useSegmentationMode";
import { coerceStringBooleans, useLabelsContext } from "../Sidebar/Annotate";
import useFocus from "../Sidebar/Annotate/useFocus";
import useColorMappingContext from "./useColorMappingContext";
import { useLighterTooltipEventHandler } from "./useLighterTooltipEventHandler";

/**
 * Hook that bridges FiftyOne state management system with Lighter.
 *
 * This is two-way:
 * 1. We listen to certain events from "FiftyOne state" world and react to them, or
 * 2. We trigger certain events into "FiftyOne state" world based on user interactions in Lighter.
 */
export const useBridge = (scene: Scene2D | null) => {
  useLighterTooltipEventHandler(scene);
  const annotationEventBus = useAnnotationEventBus();
  const commandBus = useCommandBus();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const save = useSetAtom(currentData);
  const setEditing = useSetAtom(editing);
  const setSavedLabel = useSetAtom(savedLabel);
  const getCurrentLabel = useAtomCallback(
    useCallback((get) => get(current), [])
  );
  const {
    addLabelToSidebar,
    getLabelById,
    removeLabelFromSidebar,
    updateLabelData,
  } = useLabelsContext();
  const fieldSchema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const segmentationMode = useSegmentationMode();
  const detectionMode = useDetectionMode();
  const polylineMode = usePolylineMode();
  const focus = useFocus();

  usePolylineModeInstaller();

  useAnnotationEventHandler(
    "annotation:sidebarValueUpdated",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        const overlay = scene.getOverlay(payload.overlayId);

        if (!overlay) {
          return;
        }

        scene.executeCommand(
          new UpdateLabelCommand(
            overlay,
            payload.currentLabel,
            payload.value,
            annotationEventBus
          )
        );
      },
      [annotationEventBus, scene]
    )
  );

  useAnnotationEventHandler(
    "annotation:sidebarLabelHover",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        eventBus.dispatch("lighter:do-overlay-hover", {
          id: payload.id,
          tooltip: payload.tooltip ?? false,
        });
      },
      [scene, eventBus]
    )
  );

  useAnnotationEventHandler(
    "annotation:sidebarLabelUnhover",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        eventBus.dispatch("lighter:do-overlay-unhover", {
          id: payload.id,
        });
      },
      [scene, eventBus]
    )
  );

  useEventHandler(
    "lighter:overlay-establish",
    useCallback(
      (payload) => {
        // Only route detection overlays into the detection establish path.
        // Non-detection overlays (e.g. keypoints) fire the same event but
        // should not enter the detection sidebar flow.
        if (!(payload.handler.overlay instanceof DetectionOverlay)) {
          return;
        }

        annotationEventBus.dispatch(
          "annotation:canvasDetectionOverlayEstablish",
          {
            id: payload.id,
            overlay: payload.handler.overlay,
          }
        );
      },
      [annotationEventBus]
    )
  );

  // Maintain refs so we don't miss events as useEventHandler
  // is torn down and reinstantiated.
  const segmentationModeRef = useRef(segmentationMode);
  const focusRef = useRef(focus);
  const sceneRef = useRef(scene);
  segmentationModeRef.current = segmentationMode;
  focusRef.current = focus;
  sceneRef.current = scene;

  // Route overlay selection into the focus controller (sets the editing
  // label in the sidebar) and, when the Merge tool is active, into the
  // merge tool's click handler.
  useEventHandler(
    "lighter:overlay-select",
    useCallback((payload) => {
      const sm = segmentationModeRef.current;
      const f = focusRef.current;
      const s = sceneRef.current;

      if (sm.segmentationModeActive && sm.tool === SegmentationTool.Merge) {
        const overlay = s?.getOverlay(payload.id);
        if (overlay instanceof DetectionOverlay) {
          // Merge tool consumes the click; `true` means we should skip the
          // normal focus routing (re-click of target, or source-click that
          // performed a merge). `false` means it was a first-click that
          // adopted a new target — fall through so focus loads it.
          if (sm.mergeTool.handleOverlayClick(overlay)) {
            return;
          }
        }
      }

      f.selectOverlay(payload.id, {
        ignoreSideEffects: payload.ignoreSideEffects,
      });
    }, [])
  );

  // Route overlay deselection into the focus controller (exits edit mode
  // unless we're in a generated view).
  useEventHandler(
    "lighter:overlay-deselect",
    useCallback((payload) => {
      const sm = segmentationModeRef.current;

      if (sm.segmentationModeActive && sm.tool === SegmentationTool.Merge) {
        return;
      }

      focusRef.current.deselectOverlay({
        ignoreSideEffects: payload.ignoreSideEffects,
      });
    }, [])
  );

  // Merge tool: when selection clears (e.g. right-click deselect), drop
  // the merge-target reference and exit edit mode.
  useEventHandler(
    "lighter:selection-cleared",
    useCallback((payload) => {
      const sm = segmentationModeRef.current;

      if (sm.segmentationModeActive && sm.tool === SegmentationTool.Merge) {
        sm.mergeTool.clearMergeTarget();
        focusRef.current.deselectOverlay({
          ignoreSideEffects: payload.ignoreSideEffects,
        });
      }
    }, [])
  );

  useEventHandler(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        // Read at event-handling time to avoid stale closure
        const currentLabel = getCurrentLabel();

        // If the removed overlay is the one being edited, close the sidebar
        if (currentLabel?.overlay?.id === payload.id) {
          setEditing(null);
          setSavedLabel(null);
        }

        removeLabelFromSidebar(payload.id);
      },
      [getCurrentLabel, removeLabelFromSidebar, setEditing, setSavedLabel]
    )
  );

  useEventHandler(
    "lighter:overlay-added",
    useCallback(
      (payload) => {
        if (
          payload.overlay instanceof DetectionOverlay &&
          payload.overlay.field
        ) {
          addLabelToSidebar({
            data: payload.overlay.label as DetectionLabel,
            overlay: payload.overlay,
            path: payload.overlay.field,
            type: "Detection",
          });
        }
      },
      [addLabelToSidebar]
    )
  );

  useEventHandler(
    "lighter:overlay-undone",
    useCallback(
      (payload) => {
        // Look up the label before it gets removed from the sidebar
        // (lighter:overlay-undone fires before lighter:overlay-removed)
        const label = getLabelById(payload.id);
        if (!label) {
          return;
        }

        const schema = getFieldSchema(fieldSchema, label.path);
        if (!schema) {
          return;
        }

        commandBus
          .execute(new DeleteAnnotationCommand(label, schema))
          .catch((error) => {
            console.error("Failed to persist undo of creation:", error);
          });
      },
      [commandBus, fieldSchema, getLabelById]
    )
  );

  const handleUndoRedo = useCallback(
    (
      payload:
        | AnnotationEventGroup["annotation:labelEdit"]
        | AnnotationEventGroup["annotation:undoLabelEdit"]
    ) => {
      // sync data with the sidebar
      if (payload.label) {
        updateLabelData(payload.label._id ?? payload.label.id, payload.label);
      }
    },
    [updateLabelData]
  );

  useAnnotationEventHandler("annotation:labelEdit", handleUndoRedo);
  useAnnotationEventHandler("annotation:undoLabelEdit", handleUndoRedo);

  const handleCommandEvent = useCallback(
    (payload: LighterEventGroup["lighter:command-executed"]) => {
      if (!payload.command.nextLabel) {
        return;
      }

      const newLabel = coerceStringBooleans(
        payload.command.nextLabel as Record<string, unknown>
      );

      if (newLabel) {
        save(newLabel, true);
      }
    },
    [save]
  );

  useEventHandler("lighter:command-executed", handleCommandEvent);

  // Sync sidebar/edit state when an overlay's label is mutated outside the
  // command stack (e.g. AI inference applying a new mask via updateLabel).
  useEventHandler(
    "lighter:overlay-label-updated",
    useCallback(
      (payload) => {
        if (!payload.label) return;

        const newLabel = coerceStringBooleans(
          payload.label as Record<string, unknown>
        );

        if (newLabel) {
          save(newLabel);
        }

        segmentationMode.setEditingMask(payload.id, payload.hasMask);
        detectionMode.setEditingMask(payload.id, payload.hasMask);
      },
      [detectionMode, save, segmentationMode]
    )
  );

  useEventHandler(
    "lighter:overlay-create",
    useCallback(() => {
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.create();
      } else if (detectionMode.detectionModeActive) {
        detectionMode.create();
      }
    }, [detectionMode, segmentationMode])
  );

  useEventHandler(
    "lighter:segmentation-mode-quit",
    useCallback(() => {
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.deactivateSegmentationMode();
      }
    }, [segmentationMode])
  );

  useEventHandler(
    "lighter:detection-mode-quit",
    useCallback(() => {
      detectionMode.deactivateDetectionMode();
    }, [detectionMode])
  );

  // Generic "quit the active mode" request from global gestures (e.g.
  // right-click on empty canvas). Each mode self-filters on its own active
  // state so InteractionManager doesn't need to know about modes.
  useEventHandler(
    "lighter:active-mode-quit-requested",
    useCallback(() => {
      if (detectionMode.detectionModeActive) {
        detectionMode.deactivateDetectionMode();
        return;
      }

      if (segmentationMode.segmentationModeActive) {
        segmentationMode.deactivateSegmentationMode();
        return;
      }

      if (polylineMode.polylineModeActive) {
        polylineMode.deactivatePolylineMode();
        return;
      }
    }, [detectionMode, polylineMode, segmentationMode])
  );

  useEventHandler(
    "lighter:point-selection-finalize",
    useCallback(() => {
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.finalizePointSelection();
        // Deselect the committed label so the next click starts a fresh
        // detection
        focusRef.current.deselectOverlay();
      }
    }, [segmentationMode])
  );

  const context = useColorMappingContext();

  // Effect to update scene with color scheme changes
  useEffect(() => {
    if (!scene) {
      return;
    }

    // Update the scene's color mapping context
    scene.updateColorMappingContext(context);

    // Mark all overlays as dirty to trigger re-rendering with new colors
    for (const overlay of scene.getAllOverlays()) {
      overlay.markDirty();
    }
  }, [scene, context]);
};
