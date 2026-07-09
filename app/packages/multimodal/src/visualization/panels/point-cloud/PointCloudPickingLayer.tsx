import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import {
  POINT_PICK_LAYER_ID_KEY,
  POINT_PICK_RADIUS_PX,
  pointPickWorldThreshold,
  resolvePointPick,
} from "./point-picking";
import { sourcePointIndexForRenderedIndex } from "./point-cloud-colors";
import { useScenePicking } from "./scene-interactivity";
import type { PointCloudPanelLayer } from "./types";

// Pointer must rest this long before the raycast fires — points are too
// dense for enter/leave hovering, so inspection is dwell-driven.
const POINT_HOVER_DWELL_MS = 150;
// Movement beyond this while a tooltip shows re-arms the dwell.
const POINT_HOVER_MOVE_TOLERANCE_PX = 4;

/**
 * Scene half of point-level inspect. Points deliberately carry no r3f
 * pointer handlers (that would raycast the whole cloud on every pointer
 * move), so this layer watches for the pointer resting over the canvas
 * and raycasts once per dwell. Precedence and screen-radius filtering
 * live in `point-picking.ts`; index mapping back to the decoded arrays
 * replays the render-data sampling walk
 * (`sourcePointIndexForRenderedIndex`).
 */
export function PointCloudPickingLayer({
  layers,
  maxRenderedPoints,
  pointSize,
}: {
  readonly layers: readonly PointCloudPanelLayer[];
  readonly maxRenderedPoints: number;
  readonly pointSize: number;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const raycaster = useThree((state) => state.raycaster);
  const scene = useThree((state) => state.scene);
  const pickingEnabled = useScenePicking();
  const active = pickingEnabled && layers.some((layer) => layer.onHoverPoint);

  // Latest-callback refs so the pointer listeners bind once per active
  // session instead of rebinding per render (MeasurementLayer pattern).
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const pointSizeRef = useRef(pointSize);
  pointSizeRef.current = pointSize;
  const maxRenderedPointsRef = useRef(maxRenderedPoints);
  maxRenderedPointsRef.current = maxRenderedPoints;

  // This effect binds the dwell-hover listeners to the canvas while any
  // layer is inspectable and scene picking isn't suspended (measure mode).
  useEffect(() => {
    const element = gl?.domElement as HTMLCanvasElement | undefined;
    if (!active || !element || !camera || !raycaster || !scene) {
      return undefined;
    }
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let hoveredLayerId: string | null = null;
    let shownAtX = 0;
    let shownAtY = 0;

    const clearTimer = () => {
      if (dwellTimer !== null) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
    };
    const clearHover = () => {
      if (hoveredLayerId === null) return;
      const layer = layersRef.current.find(
        (candidate) => candidate.id === hoveredLayerId,
      );
      hoveredLayerId = null;
      layer?.onHoverPoint?.(null);
    };

    const raycastAt = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      // Casts, not types: fiber's bundled three types are out of sync
      // with the app's pinned three version — see MeasurementLayer.
      const threeCamera = camera as unknown as THREE.Camera;
      const threeRaycaster = raycaster as unknown as THREE.Raycaster;
      const threeScene = scene as unknown as THREE.Scene;

      const pointsObjects = collectPickablePoints(threeScene);
      if (pointsObjects.length === 0) return;

      const pickRadiusPx = Math.max(POINT_PICK_RADIUS_PX, pointSizeRef.current);
      const threshold = worldThresholdForObjects({
        camera: threeCamera,
        pickRadiusPx,
        pointsObjects,
        viewportHeightPx: rect.height,
      });
      if (threshold <= 0) return;

      const pointerX = clientX - rect.left;
      const pointerY = clientY - rect.top;
      const ndc = new THREE.Vector2(
        (pointerX / rect.width) * 2 - 1,
        -((pointerY / rect.height) * 2 - 1),
      );
      threeRaycaster.setFromCamera(ndc, threeCamera);

      // The raycaster is shared with r3f's own event system — restore
      // its Points threshold after this one-off scan.
      const pointsParams = threeRaycaster.params.Points ?? { threshold: 1 };
      threeRaycaster.params.Points = pointsParams;
      const previousThreshold = pointsParams.threshold;
      pointsParams.threshold = threshold;
      let intersections: THREE.Intersection[];
      try {
        intersections = threeRaycaster.intersectObjects(
          threeScene.children,
          true,
        );
      } finally {
        pointsParams.threshold = previousThreshold;
      }

      const projected = new THREE.Vector3();
      const pick = resolvePointPick(
        intersections,
        (worldPoint) => {
          projected.copy(worldPoint).project(threeCamera);
          const screenX = ((projected.x + 1) / 2) * rect.width;
          const screenY = ((1 - projected.y) / 2) * rect.height;
          return Math.hypot(screenX - pointerX, screenY - pointerY);
        },
        pickRadiusPx,
      );
      if (!pick) {
        clearHover();
        return;
      }

      const layer = layersRef.current.find(
        (candidate) => candidate.id === pick.layerId,
      );
      if (!layer?.onHoverPoint) {
        clearHover();
        return;
      }
      const pointIndex = sourcePointIndexForRenderedIndex(
        layer.frame.positions,
        maxRenderedPointsRef.current,
        pick.renderedIndex,
      );
      if (pointIndex === null) {
        clearHover();
        return;
      }
      if (hoveredLayerId !== null && hoveredLayerId !== pick.layerId) {
        clearHover();
      }
      hoveredLayerId = pick.layerId;
      shownAtX = clientX;
      shownAtY = clientY;
      layer.onHoverPoint({ pointIndex, worldPosition: pick.worldPosition });
    };

    const handlePointerMove = (event: PointerEvent) => {
      clearTimer();
      if (event.buttons !== 0) {
        // Orbiting/panning — never inspect mid-drag.
        clearHover();
        return;
      }
      if (
        hoveredLayerId !== null &&
        Math.hypot(event.clientX - shownAtX, event.clientY - shownAtY) >
          POINT_HOVER_MOVE_TOLERANCE_PX
      ) {
        clearHover();
      }
      const { clientX, clientY } = event;
      dwellTimer = setTimeout(() => {
        dwellTimer = null;
        raycastAt(clientX, clientY);
      }, POINT_HOVER_DWELL_MS);
    };
    const handlePointerEnd = () => {
      clearTimer();
      clearHover();
    };

    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerdown", handlePointerEnd);
    element.addEventListener("pointerleave", handlePointerEnd);
    // Wheel zoom shifts the scene under a resting cursor; the shown point
    // would no longer be the one under the pointer.
    element.addEventListener("wheel", handlePointerEnd, { passive: true });
    return () => {
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerdown", handlePointerEnd);
      element.removeEventListener("pointerleave", handlePointerEnd);
      element.removeEventListener("wheel", handlePointerEnd);
      clearTimer();
      clearHover();
    };
  }, [active, camera, gl, raycaster, scene]);

  return null;
}

function collectPickablePoints(scene: THREE.Scene): THREE.Points[] {
  const pointsObjects: THREE.Points[] = [];
  scene.traverse((object) => {
    if (
      (object as THREE.Points).isPoints &&
      typeof object.userData?.[POINT_PICK_LAYER_ID_KEY] === "string"
    ) {
      pointsObjects.push(object as THREE.Points);
    }
  });
  return pointsObjects;
}

/**
 * One generous world threshold covering the pick radius at every pickable
 * cloud's distance; the screen-space filter tightens the final answer.
 */
function worldThresholdForObjects({
  camera,
  pickRadiusPx,
  pointsObjects,
  viewportHeightPx,
}: {
  readonly camera: THREE.Camera;
  readonly pickRadiusPx: number;
  readonly pointsObjects: readonly THREE.Points[];
  readonly viewportHeightPx: number;
}): number {
  const center = new THREE.Vector3();
  let threshold = 0;
  for (const object of pointsObjects) {
    const sphere = object.geometry?.boundingSphere;
    if (!sphere) continue;
    center.copy(sphere.center).applyMatrix4(object.matrixWorld);
    threshold = Math.max(
      threshold,
      pointPickWorldThreshold({
        camera,
        pickRadiusPx,
        referenceDistance: camera.position.distanceTo(center),
        viewportHeightPx,
      }),
    );
  }
  return threshold;
}
