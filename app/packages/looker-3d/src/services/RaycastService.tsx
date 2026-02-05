import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { getPanelElementId } from "../constants";
import { activeCursorPanelAtom, raycastResultAtom } from "../state";
import type { PanelId } from "../types";
import { toNDCForElement } from "../utils";
import { getRaycastableObjects } from "../utils/raycast-utils";

interface RaycastServiceProps {
  panelId: PanelId;
}

/**
 * Centralized raycasting service that performs a single raycast per pointermove.
 *
 * Only performs raycasting when for the panel which it is bound to.
 *
 * @param panelId - The ID of the panel this service belongs to
 */
export const RaycastService = ({ panelId }: RaycastServiceProps) => {
  const activeCursorPanel = useRecoilValue(activeCursorPanelAtom);
  const setRaycastResult = useSetRecoilState(raycastResultAtom);

  const { camera, raycaster, gl, events, scene } = useThree();

  const panelElementRef = useRef<HTMLElement | null>(null);

  // This effect gets the panel element on mount
  useEffect(() => {
    const elementId = getPanelElementId(panelId);
    panelElementRef.current = document.getElementById(elementId);
  }, [panelId]);

  const handlePointerMove = useCallback(
    (ev: PointerEvent) => {
      if (activeCursorPanel !== panelId) {
        return;
      }

      const panelElement = panelElementRef.current;
      if (!panelElement) {
        return;
      }

      const ndc = toNDCForElement(ev, panelElement);

      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

      const raycastableObjects = getRaycastableObjects(scene);
      const intersections = raycaster.intersectObjects(
        raycastableObjects,
        false
      );

      if (intersections.length === 0) {
        // No object hit - clear raycast result
        setRaycastResult({
          sourcePanel: null,
          worldPosition: null,
          intersectedObjectUuid: null,
          pointIndex: null,
          distance: null,
          timestamp: Date.now(),
        });
        return;
      }

      // Use the closest intersection
      const closest = intersections[0];
      const worldPos = closest.point;

      const position: [number, number, number] = [
        worldPos.x,
        worldPos.y,
        worldPos.z,
      ];

      const pointIndex = closest.index !== undefined ? closest.index : null;

      setRaycastResult({
        sourcePanel: panelId,
        worldPosition: position,
        // Note: Recoil freezes objects so can't store the full intersected object...
        // but we can store the UUID
        intersectedObjectUuid: closest.object.uuid,
        pointIndex,
        distance: closest.distance,
        timestamp: Date.now(),
      });
    },
    [activeCursorPanel, panelId, camera, raycaster, scene]
  );

  // This effect sets up the pointermove listener on the canvas and performs raycasting
  useEffect(() => {
    const el = (events.connected ?? gl.domElement) as HTMLCanvasElement;

    el.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
    };
  }, [gl, events, handlePointerMove]);

  return null;
};
