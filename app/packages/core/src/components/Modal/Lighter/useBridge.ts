/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEventHandler } from "@fiftyone/annotation";
import {
  type LighterEventGroup,
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  UpdateLabelCommand,
  useLighterEventBus,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import * as fos from "@fiftyone/state";
import { currentData, currentOverlay } from "../Sidebar/Annotate/Edit/state";
import { coerceStringBooleans } from "../Sidebar/Annotate/utils";
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
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const save = useSetAtom(currentData);
  const overlay = useAtomValue(currentOverlay);

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
          new UpdateLabelCommand(overlay, payload.currentLabel, payload.value)
        );
      },
      [scene]
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

  const handleCommandEvent = useCallback(
    (
      payload:
        | LighterEventGroup["lighter:command-executed"]
        | LighterEventGroup["lighter:undo"]
        | LighterEventGroup["lighter:redo"]
    ) => {
      // Here, this would be true for `undo` or `redo`
      if (
        !("command" in payload) ||
        !(payload.command instanceof UpdateLabelCommand)
      ) {
        const label = overlay?.label;

        if (label) {
          save(label);
        }

        return;
      }

      if (!payload.command.nextLabel) {
        return;
      }

      const newLabel = coerceStringBooleans(
        payload.command.nextLabel as Record<string, unknown>
      );

      if (newLabel) {
        save(newLabel);
      }
    },
    [overlay, save]
  );

  useEventHandler("lighter:command-executed", handleCommandEvent);
  useEventHandler("lighter:redo", handleCommandEvent);
  useEventHandler("lighter:undo", handleCommandEvent);

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

  const [viewport, setViewport] = useAtom(fos.modalViewport);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const lastLighterViewport = useRef<{
    scale: number;
    pan: [number, number];
  } | null>(null);

  const [readyCount, setReadyCount] = useState(0);

  // Reset lastLighterViewport when scene changes (e.g., switching modes)
  // This prevents stale viewport data from being used
  useEffect(() => {
    lastLighterViewport.current = null;
  }, [scene]);

  useEventHandler(
    "lighter:ready",
    useCallback(() => {
      setReadyCount((c: number) => c + 1);

      // Apply viewport immediately when ready to prevent flash
      if (scene && viewport) {
        const renderer = scene.getRenderer();
        if (renderer.isReady()) {
          renderer.setViewport(viewport.scale, viewport.pan);
        }
      }
    }, [scene, viewport])
  );

  useEventHandler(
    "lighter:viewport-moved",
    useCallback(
      (payload) => {
        lastLighterViewport.current = {
          scale: payload.scale,
          pan: [payload.x, payload.y],
        };

        // Only update the atom if the user is actively interacting
        // This prevents initialization/auto-center events from overwriting
        // the atom with stale data when switching back from Looker
        if (!scene) return;
        const renderer = scene.getRenderer();
        if (!renderer.isReady() || !renderer.isInteracting()) {
          return;
        }

        setViewport((prev: { scale: number; pan: [number, number] } | null) => {
          if (
            prev?.scale === payload.scale &&
            prev?.pan[0] === payload.x &&
            prev?.pan[1] === payload.y
          ) {
            return prev;
          }
          return { scale: payload.scale, pan: [payload.x, payload.y] };
        });
      },
      [setViewport, scene]
    )
  );

  useEffect(() => {
    if (!scene) return;

    const renderer = scene.getRenderer();
    if (!renderer.isReady()) return;

    // Don't update if user is currently interacting (to prevent snap-back)
    if (renderer.isInteracting()) {
      return;
    }

    // If we have a viewport in the atom, apply it
    // This runs whenever Lighter becomes ready (readyCount changes)
    if (viewport) {
      const currentScale = renderer.getScale();
      const currentPos = renderer.getViewportPosition();

      // Apply viewport if it differs from Lighter's current state
      if (
        viewport.scale !== currentScale ||
        viewport.pan[0] !== currentPos.x ||
        viewport.pan[1] !== currentPos.y
      ) {
        renderer.setViewport(viewport.scale, viewport.pan);
      }
    }
  }, [scene, readyCount, viewport]);
};
