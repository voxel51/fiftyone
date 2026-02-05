import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { getPanelElementId } from "../constants";
import { activeCursorPanelAtom, cursorStateAtom } from "../state";
import type { PanelId } from "../types";
import { toNDCForElement } from "../utils";

interface CursorTrackerProps {
  panelId: PanelId;
}

/**
 * Objects to exclude from raycasting (helpers, gizmos, UI elements, etc.)
 */
const EXCLUDED_OBJECT_TYPES = new Set([
  "GridHelper",
  "AxesHelper",
  "ArrowHelper",
  "BoxHelper",
  "Box3Helper",
  "CameraHelper",
  "DirectionalLightHelper",
  "HemisphereLightHelper",
  "PointLightHelper",
  "SpotLightHelper",
  "TransformControls",
]);

/**
 * User data keys that indicate an object should be excluded from raycasting
 */
const EXCLUDED_USER_DATA_KEYS = [
  "isHelper",
  "isGizmo",
  "isTransformControls",
  "isAnnotationPlane",
  "isCrosshair",
];

/**
 * Check if an object should be included in raycasting.
 */
function isRaycastable(object: THREE.Object3D): boolean {
  if (!object.visible) return false;

  if (EXCLUDED_OBJECT_TYPES.has(object.type)) return false;
  if (object.constructor && EXCLUDED_OBJECT_TYPES.has(object.constructor.name))
    return false;

  for (const key of EXCLUDED_USER_DATA_KEYS) {
    if (object.userData[key]) return false;
  }

  // Exclude objects without geometry (groups, empty objects)
  // But allow Points, Lines, and Meshes
  if (
    !(object instanceof THREE.Mesh) &&
    !(object instanceof THREE.Points) &&
    !(object instanceof THREE.Line) &&
    !(object instanceof THREE.LineSegments) &&
    !(object instanceof THREE.Sprite)
  ) {
    return false;
  }

  return true;
}

/**
 * Build a list of raycastable objects from the scene.
 */
function getRaycastableObjects(scene: THREE.Scene): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];

  scene.traverse((object) => {
    if (isRaycastable(object)) {
      objects.push(object);
    }
  });

  return objects;
}

/**
 * Tracks the cursor position in 3D space for a specific panel.
 *
 * Only shows cursor when raycasting hits actual scene objects (meshes, points, lines, etc.).
 * Only performs raycasting when this panel is the active cursor panel.
 *
 * @param panelId - The ID of the panel this tracker belongs to
 */
export const CursorTracker = ({ panelId }: CursorTrackerProps) => {
  const activeCursorPanel = useRecoilValue(activeCursorPanelAtom);
  const setCursorState = useSetRecoilState(cursorStateAtom);

  const { camera, raycaster, gl, events, scene } = useThree();

  // Reference to the panel element for NDC computation
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

      // Compute NDC relative to the panel element
      const ndc = toNDCForElement(ev, panelElement);

      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

      // Raycast against scene objects only
      const raycastableObjects = getRaycastableObjects(scene);
      const intersections = raycaster.intersectObjects(
        raycastableObjects,
        false
      );

      if (intersections.length === 0) {
        // No object hit - clear cursor state
        setCursorState({
          sourcePanel: null,
          worldPosition: null,
          timestamp: Date.now(),
        });
        return;
      }

      // Use the closest object intersection
      const worldPos = intersections[0].point;

      const position: [number, number, number] = [
        worldPos.x,
        worldPos.y,
        worldPos.z,
      ];

      setCursorState({
        sourcePanel: panelId,
        worldPosition: position,
        timestamp: Date.now(),
      });
    },
    [activeCursorPanel, panelId, camera, raycaster, scene]
  );

  useEffect(() => {
    const el = (events.connected ?? gl.domElement) as HTMLCanvasElement;

    el.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
    };
  }, [gl, events, handlePointerMove]);

  return null;
};
