/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Hook for the polyline/vertex drawing tool.
 *
 * Click-to-place points that form a closed polygon (polyline).
 * Each point is connected sequentially, and double-click closes the shape
 * (via InteractiveKeypointHandler.onDoubleClick → lighter:overlay-establish).
 */

import { useCallback, useMemo, useRef } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { getEventBus } from "@fiftyone/events";

import {
  type KeypointOptions,
  type KeypointOverlay,
  type LighterEventGroup,
  InteractiveKeypointHandler,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { v4 as generateUUID } from "uuid";

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

const polylineActiveAtom = atom<boolean>(false);
const polylineOverlayIdAtom = atom<string | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const usePolylineTool = () => {
  const { scene, addOverlay, removeOverlay, overlayFactory, getOverlay } =
    useLighter();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const active = useAtomValue(polylineActiveAtom);
  const overlayId = useAtomValue(polylineOverlayIdAtom);
  const setActive = useSetAtom(polylineActiveAtom);
  const setOverlayId = useSetAtom(polylineOverlayIdAtom);

  // ---- enter / exit ----

  const enter = useCallback(() => {
    const currentScene = sceneRef.current;
    if (!currentScene || !overlayFactory) return;

    setActive(true);

    // Create a KeypointOverlay configured for polygon drawing:
    // - connections start empty, grow as points are added
    // - closed: true → last point connects back to first
    const id = `polyline-${generateUUID()}`;
    const overlay = overlayFactory.create<KeypointOptions, KeypointOverlay>(
      "keypoint",
      {
        id,
        field: "",
        label: { id, label: "polyline", tags: [], points: [] } as any,
        connections: [],
        closed: false,
        draggable: true,
        deletable: true,
        selectable: true,
      }
    );

    addOverlay(overlay, false);
    setOverlayId(id);

    // Enter interactive mode — click places points, double-click finishes
    const eventBus = getEventBus<LighterEventGroup>(
      currentScene.getEventChannel()
    );
    const handler = new InteractiveKeypointHandler(overlay, eventBus);
    currentScene.enterInteractiveMode(handler);
  }, [overlayFactory, addOverlay, setActive, setOverlayId]);

  const exit = useCallback(() => {
    const currentScene = sceneRef.current;
    if (currentScene && !currentScene.isDestroyed) {
      currentScene.exitInteractiveMode();
    }

    const currentOverlayId = overlayId;
    if (currentOverlayId) {
      removeOverlay(currentOverlayId, false);
    }

    setActive(false);
    setOverlayId(null);
  }, [overlayId, removeOverlay, setActive, setOverlayId]);

  // ---- update connections as points are added ----

  const getPolylineOverlayId = useAtomCallback(
    useCallback((get) => get(polylineOverlayIdAtom), [])
  );

  useEventHandler(
    "lighter:keypoint-point-added",
    useCallback(
      (payload) => {
        const currentOverlayId = getPolylineOverlayId();
        if (!currentOverlayId || payload.id !== currentOverlayId) return;

        // Rebuild sequential connection: [[0, 1, 2, ..., n]]
        const overlay = getOverlay?.(currentOverlayId) as
          | KeypointOverlay
          | undefined;
        if (!overlay) return;

        const points = overlay.getRelativePoints();
        if (points.length >= 2) {
          const path = Array.from({ length: points.length }, (_, i) => i);
          overlay.setConnections([path]);
        }
      },
      [getOverlay, getPolylineOverlayId]
    )
  );

  // Update connections when a point is deleted
  useEventHandler(
    "lighter:keypoint-point-deleted",
    useCallback(
      (payload) => {
        const currentOverlayId = getPolylineOverlayId();
        if (!currentOverlayId || payload.id !== currentOverlayId) return;

        const overlay = getOverlay?.(currentOverlayId) as
          | KeypointOverlay
          | undefined;
        if (!overlay) return;

        const points = overlay.getRelativePoints();
        if (points.length >= 2) {
          const path = Array.from({ length: points.length }, (_, i) => i);
          overlay.setConnections([path]);
        } else {
          overlay.setConnections([]);
        }
      },
      [getOverlay, getPolylineOverlayId]
    )
  );

  // When the overlay is established (double-click), deactivate the tool
  useEventHandler(
    "lighter:overlay-establish",
    useCallback(
      (payload) => {
        const currentOverlayId = getPolylineOverlayId();
        if (!currentOverlayId || payload.id !== currentOverlayId) return;

        // Shape is finalized — exit interactive mode and deactivate
        const currentScene = sceneRef.current;
        if (currentScene && !currentScene.isDestroyed) {
          currentScene.exitInteractiveMode();
        }
        setActive(false);
        setOverlayId(null);
      },
      [getPolylineOverlayId, setActive, setOverlayId]
    )
  );

  // ---- return ----

  return useMemo(
    () => ({
      active,
      enter,
      exit,
    }),
    [active, enter, exit]
  );
};
