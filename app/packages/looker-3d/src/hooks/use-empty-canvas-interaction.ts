import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  createPlane,
  getPlaneIntersection,
  isButtonMatch,
  toNDC,
} from "../utils";

type Options = {
  onPointerUp?: (pt: THREE.Vector3, ev: PointerEvent) => void;
  onPointerDown?: () => void;
  onPointerMove?: (
    pt: THREE.Vector3,
    ptPerpendicular: THREE.Vector3 | null,
    ev: PointerEvent
  ) => void;
  planeNormal?: THREE.Vector3;
  planeConstant?: number;
  button?: number;
  doubleRaycast?: boolean;
};

export function useEmptyCanvasInteraction({
  onPointerUp,
  onPointerDown,
  onPointerMove,
  planeNormal = new THREE.Vector3(0, 1, 0),
  planeConstant = 0,
  button = 0,
  doubleRaycast = false,
}: Options = {}) {
  // Refs to avoid re-rendering
  const onPointerUpRef = useRef(onPointerUp);
  const onPointerDownRef = useRef(onPointerDown);
  const onPointerMoveRef = useRef(onPointerMove);

  onPointerUpRef.current = onPointerUp;
  onPointerDownRef.current = onPointerDown;
  onPointerMoveRef.current = onPointerMove;

  const { gl, camera, scene, raycaster, events } = useThree();

  const plane = useMemo(
    () => createPlane(planeNormal, planeConstant),
    [planeNormal, planeConstant]
  );

  // Create perpendicular plane for cursor position
  const perpendicularPlane = useMemo(() => {
    const normalizedNormal = planeNormal.clone().normalize();

    // If z-axis is the plane normal, use y-axis for perpendicular plane
    if (Math.abs(normalizedNormal.z) > 0.9) {
      return createPlane(new THREE.Vector3(0, 1, 0), planeConstant);
    }
    // If y-axis is the plane normal, use z-axis for perpendicular plane
    if (Math.abs(normalizedNormal.y) > 0.9) {
      return createPlane(new THREE.Vector3(0, 0, 1), planeConstant);
    }

    // Default fallback - use z-axis
    return createPlane(new THREE.Vector3(0, 0, 1), planeConstant);
  }, [planeNormal, planeConstant]);

  useEffect(() => {
    const el = (events.connected ?? gl.domElement) as HTMLCanvasElement;

    const handlePointerMove = (ev: PointerEvent) => {
      if (!onPointerMoveRef.current) return;
      const ndc = toNDC(ev, el);
      const pt = getPlaneIntersection(raycaster, camera, ndc, plane);
      const ptPerpendicular = doubleRaycast
        ? getPlaneIntersection(raycaster, camera, ndc, perpendicularPlane)
        : null;
      onPointerMoveRef.current?.(pt, ptPerpendicular, ev);
    };

    const handleDown = (ev: PointerEvent) => {
      if (!isButtonMatch(ev, button)) return;
      onPointerDownRef.current?.();
    };

    const handleUp = (ev: PointerEvent) => {
      if (!isButtonMatch(ev, button)) return;
      const ndc = toNDC(ev, el);
      const pt = getPlaneIntersection(raycaster, camera, ndc, plane);
      if (pt) onPointerUpRef.current?.(pt, ev);
    };

    el.addEventListener("pointermove", handlePointerMove, { passive: true });
    el.addEventListener("pointerdown", handleDown, { passive: true });
    el.addEventListener("pointerup", handleUp, { passive: true });

    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerdown", handleDown);
      el.removeEventListener("pointerup", handleUp);
    };
  }, [gl, camera, scene, raycaster, events, plane, perpendicularPlane, button]);
}
