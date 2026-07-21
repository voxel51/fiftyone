/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { CLICK_DRAG_TOLERANCE_PX } from "../shared/interaction";
import {
  type MeasurementPlaneUpAxis,
  type MeasurementPoint,
  type MeasurementState,
} from "./measurement";

const MEASUREMENT_COLOR = 0xffc857;
const MARKER_RADIUS_M = 0.12;
const PREVIEW_DOT_SIZE_PX = 4;
const PREVIEW_DOT_SPACING_M = 0.5;
const PREVIEW_DOT_MAX_SEGMENTS = 160;
const PREVIEW_MIN_DISTANCE_M = 0.001;
const MEASUREMENT_RENDER_ORDER = 10_000;
const GRID_PLANE_NORMALS: Record<MeasurementPlaneUpAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/** Intersect the camera ray with the infinite world grid plane. */
export function pickGridPlanePoint({
  camera,
  ndc,
  planeUp,
  raycaster,
}: {
  readonly camera: THREE.Camera;
  readonly ndc: THREE.Vector2;
  readonly planeUp: MeasurementPlaneUpAxis;
  readonly raycaster: THREE.Raycaster;
}): THREE.Vector3 | null {
  raycaster.setFromCamera(ndc, camera);

  const point = raycaster.ray.intersectPlane(
    new THREE.Plane(GRID_PLANE_NORMALS[planeUp], 0),
    new THREE.Vector3(),
  );
  if (!point || !Number.isFinite(point.x + point.y + point.z)) {
    return null;
  }

  return point;
}

/** Dotted preview positions between the anchored point and current hover. */
export function previewDottedLinePositions(
  start: MeasurementPoint,
  end: MeasurementPoint,
): Float32Array | null {
  const distance = Math.hypot(
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2],
  );
  if (distance < PREVIEW_MIN_DISTANCE_M) {
    return null;
  }

  const segmentCount = Math.min(
    PREVIEW_DOT_MAX_SEGMENTS,
    Math.max(1, Math.ceil(distance / PREVIEW_DOT_SPACING_M)),
  );
  const positions = new Float32Array((segmentCount + 1) * 3);
  for (let index = 0; index <= segmentCount; index += 1) {
    const offset = index * 3;
    const t = index / segmentCount;
    positions[offset] = start[0] + (end[0] - start[0]) * t;
    positions[offset + 1] = start[1] + (end[1] - start[1]) * t;
    positions[offset + 2] = start[2] + (end[2] - start[2]) * t;
  }

  return positions;
}

/**
 * Scene half of the measurement tool: while armed, non-drag clicks
 * raycast the world grid plane and report those points up. A complete
 * measurement renders as two markers and a connecting line; while the
 * second point is pending, hover movement renders a dotted preview segment.
 * The distance stays in the panel HUD so the WebGPU scene avoids
 * text-sprite artifacts.
 */
export function MeasurementLayer({
  armed,
  measurement,
  onPick,
  planeUp,
}: {
  readonly armed: boolean;
  readonly measurement: MeasurementState | null;
  readonly onPick: (point: MeasurementPoint) => void;
  readonly planeUp: MeasurementPlaneUpAxis;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const raycaster = useThree((state) => state.raycaster);
  const invalidate = useThree((state) => state.invalidate);
  const [hoverPoint, setHoverPoint] = useState<MeasurementPoint | null>(null);

  // Latest-callback ref so the pointer listeners bind once per armed
  // session instead of rebinding per render.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const measurementRef = useRef(measurement);
  measurementRef.current = measurement;
  const planeUpRef = useRef(planeUp);
  planeUpRef.current = planeUp;

  // This effect binds the pick listeners to the canvas while armed.
  useEffect(() => {
    const element = gl?.domElement as HTMLCanvasElement | undefined;
    if (!armed || !element || !camera || !raycaster) {
      return undefined;
    }
    let downX = 0;
    let downY = 0;
    const pickEventPoint = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
      // Casts, not types: fiber's bundled three types are out of sync
      // with the app's pinned three version — see GridSceneLayer.
      return pickGridPlanePoint({
        camera: camera as unknown as THREE.Camera,
        ndc,
        planeUp: planeUpRef.current,
        raycaster: raycaster as unknown as THREE.Raycaster,
      });
    };
    const handlePointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const handlePointerUp = (event: PointerEvent) => {
      const traveled = Math.hypot(event.clientX - downX, event.clientY - downY);
      if (traveled > CLICK_DRAG_TOLERANCE_PX) return;
      const point = pickEventPoint(event);
      if (point) onPickRef.current([point.x, point.y, point.z]);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const current = measurementRef.current;
      if (!current || current.b) return;
      const point = pickEventPoint(event);
      setHoverPoint(point ? [point.x, point.y, point.z] : null);
    };
    const handlePointerLeave = () => {
      setHoverPoint(null);
    };
    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointerleave", handlePointerLeave);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", handlePointerUp);
    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointerleave", handlePointerLeave);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerup", handlePointerUp);
    };
  }, [armed, camera, gl, raycaster]);

  useEffect(() => {
    if (!armed || !measurement || measurement.b) {
      setHoverPoint(null);
    }
  }, [armed, measurement]);

  // This effect repaints the demand-driven canvas as the measurement
  // overlay appears, completes, or clears.
  useEffect(() => {
    invalidate?.();
  }, [hoverPoint, invalidate, measurement]);

  const lineGeometry = useMemo(() => {
    if (!measurement?.b) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([...measurement.a, ...measurement.b], 3),
    );
    return geometry;
  }, [measurement]);
  useEffect(() => () => lineGeometry?.dispose(), [lineGeometry]);

  const previewGeometry = useMemo(() => {
    if (!measurement || measurement.b || !hoverPoint) return null;
    const positions = previewDottedLinePositions(measurement.a, hoverPoint);
    if (!positions) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [hoverPoint, measurement]);
  useEffect(() => () => previewGeometry?.dispose(), [previewGeometry]);

  if (!measurement) return null;

  return (
    <group
      renderOrder={MEASUREMENT_RENDER_ORDER}
      userData={{ isMeasurementOverlay: true }}
    >
      <mesh
        frustumCulled={false}
        position={measurement.a}
        renderOrder={MEASUREMENT_RENDER_ORDER}
      >
        <sphereGeometry args={[MARKER_RADIUS_M, 12, 8]} />
        <meshBasicMaterial
          color={MEASUREMENT_COLOR}
          depthTest={false}
          depthWrite={false}
          transparent
        />
      </mesh>
      {measurement.b ? (
        <mesh
          frustumCulled={false}
          position={measurement.b}
          renderOrder={MEASUREMENT_RENDER_ORDER}
        >
          <sphereGeometry args={[MARKER_RADIUS_M, 12, 8]} />
          <meshBasicMaterial
            color={MEASUREMENT_COLOR}
            depthTest={false}
            depthWrite={false}
            transparent
          />
        </mesh>
      ) : null}
      {lineGeometry ? (
        <lineSegments
          frustumCulled={false}
          renderOrder={MEASUREMENT_RENDER_ORDER}
        >
          <primitive attach="geometry" object={lineGeometry} />
          <lineBasicMaterial
            color={MEASUREMENT_COLOR}
            depthTest={false}
            depthWrite={false}
            transparent
          />
        </lineSegments>
      ) : null}
      {previewGeometry ? (
        <points frustumCulled={false} renderOrder={MEASUREMENT_RENDER_ORDER}>
          <primitive attach="geometry" object={previewGeometry} />
          <pointsMaterial
            color={MEASUREMENT_COLOR}
            depthTest={false}
            depthWrite={false}
            size={PREVIEW_DOT_SIZE_PX}
            sizeAttenuation={false}
            transparent
          />
        </points>
      ) : null}
    </group>
  );
}
