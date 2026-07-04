/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  formatMeasurementDistance,
  measurementDistance,
  pointsPickThreshold,
  type MeasurementPoint,
  type MeasurementState,
} from "./measurement";
import { SceneTextSprite } from "./scene-text-sprite";

const MEASUREMENT_COLOR = 0xffc857;
const MEASUREMENT_OPACITY = 0.95;
const MARKER_RADIUS_M = 0.12;
// Lift the distance label off the line midpoint so it doesn't sit inside
// the measured geometry.
const LABEL_LIFT_M = 0.35;
const LABEL_FONT_SIZE = 16;
// A click that traveled further than this (pointer-down → pointer-up, px)
// is an orbit drag, not a pick.
const CLICK_DRAG_TOLERANCE_PX = 4;

/**
 * Nearest scene point under an NDC ray: individual lidar returns
 * (`Points`, with a distance-scaled snap radius) and solid surfaces
 * (`Mesh` — annotation bodies, ground/map planes). The measurement's own
 * overlay and line/sprite objects are skipped.
 */
export function pickScenePoint({
  camera,
  ndc,
  raycaster,
  scene,
}: {
  readonly camera: THREE.Camera;
  readonly ndc: THREE.Vector2;
  readonly raycaster: THREE.Raycaster;
  readonly scene: THREE.Object3D;
}): THREE.Vector3 | null {
  raycaster.setFromCamera(ndc, camera);

  const candidates: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (!object.visible || insideMeasurementOverlay(object)) return;
    const typed = object as Partial<THREE.Points & THREE.Mesh>;
    if (typed.isPoints || typed.isMesh) candidates.push(object);
  });

  const scratchCenter = new THREE.Vector3();
  let best: THREE.Intersection | null = null;
  for (const object of candidates) {
    if ((object as Partial<THREE.Points>).isPoints) {
      object.getWorldPosition(scratchCenter);
      raycaster.params.Points = {
        threshold: pointsPickThreshold(
          camera.position.distanceTo(scratchCenter),
        ),
      };
    }
    for (const hit of raycaster.intersectObject(object, false)) {
      if (!best || hit.distance < best.distance) best = hit;
    }
  }
  return best?.point ?? null;
}

function insideMeasurementOverlay(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.userData.isMeasurementOverlay) return true;
    node = node.parent;
  }
  return false;
}

/**
 * Scene half of the measurement tool: while armed, non-drag clicks
 * raycast-pick scene points and report them up; a complete measurement
 * renders as two markers, a connecting line, and a billboard distance
 * label. Depth testing is off on the overlay so the measurement stays
 * readable through the cloud.
 */
export function MeasurementLayer({
  armed,
  measurement,
  onPick,
}: {
  readonly armed: boolean;
  readonly measurement: MeasurementState | null;
  readonly onPick: (point: MeasurementPoint) => void;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const raycaster = useThree((state) => state.raycaster);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  // Latest-callback ref so the pointer listeners bind once per armed
  // session instead of rebinding per render.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // This effect binds the pick listeners to the canvas while armed.
  useEffect(() => {
    const element = gl?.domElement as HTMLCanvasElement | undefined;
    if (!armed || !element || !camera || !raycaster || !scene) {
      return undefined;
    }
    let downX = 0;
    let downY = 0;
    const handlePointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const handlePointerUp = (event: PointerEvent) => {
      const traveled = Math.hypot(event.clientX - downX, event.clientY - downY);
      if (traveled > CLICK_DRAG_TOLERANCE_PX) return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
      // Casts, not types: fiber's bundled three types are out of sync
      // with the app's pinned three version — see GridSceneLayer.
      const point = pickScenePoint({
        camera: camera as unknown as THREE.Camera,
        ndc,
        raycaster: raycaster as unknown as THREE.Raycaster,
        scene: scene as unknown as THREE.Object3D,
      });
      if (point) onPickRef.current([point.x, point.y, point.z]);
    };
    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointerup", handlePointerUp);
    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointerup", handlePointerUp);
    };
  }, [armed, camera, gl, raycaster, scene]);

  // This effect repaints the demand-driven canvas as the measurement
  // overlay appears, completes, or clears.
  useEffect(() => {
    invalidate?.();
  }, [invalidate, measurement]);

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

  const distance = measurementDistance(measurement);
  const labelPrimitive = useMemo(() => {
    if (!measurement?.b || distance === null) return null;
    const [ax, ay, az] = measurement.a;
    const [bx, by, bz] = measurement.b;
    return {
      billboard: true,
      color: [1, 0.78, 0.34, 1] as const,
      fontSize: LABEL_FONT_SIZE,
      pose: {
        position: [
          (ax + bx) / 2,
          (ay + by) / 2,
          (az + bz) / 2 + LABEL_LIFT_M,
        ] as const,
        quaternion: [0, 0, 0, 1] as const,
      },
      scaleInvariant: true,
      text: formatMeasurementDistance(distance),
    };
  }, [distance, measurement]);

  if (!measurement) return null;

  return (
    <group userData={{ isMeasurementOverlay: true }}>
      <mesh frustumCulled={false} position={measurement.a}>
        <sphereGeometry args={[MARKER_RADIUS_M, 12, 8]} />
        <meshBasicMaterial
          color={MEASUREMENT_COLOR}
          depthTest={false}
          opacity={MEASUREMENT_OPACITY}
          transparent
        />
      </mesh>
      {measurement.b ? (
        <mesh frustumCulled={false} position={measurement.b}>
          <sphereGeometry args={[MARKER_RADIUS_M, 12, 8]} />
          <meshBasicMaterial
            color={MEASUREMENT_COLOR}
            depthTest={false}
            opacity={MEASUREMENT_OPACITY}
            transparent
          />
        </mesh>
      ) : null}
      {lineGeometry ? (
        <lineSegments frustumCulled={false}>
          <primitive attach="geometry" object={lineGeometry} />
          <lineBasicMaterial
            color={MEASUREMENT_COLOR}
            depthTest={false}
            opacity={MEASUREMENT_OPACITY}
            transparent
          />
        </lineSegments>
      ) : null}
      {labelPrimitive ? (
        <SceneTextSprite textPrimitive={labelPrimitive} />
      ) : null}
    </group>
  );
}
