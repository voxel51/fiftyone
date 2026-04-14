import * as THREE from "three";
import type { Points3dBounds } from "./types";

const DEFAULT_BOUNDS_PADDING = 1.7;
const DEFAULT_CAMERA_DIRECTION = new THREE.Vector3(1, -1, 0.8).normalize();
const MIN_CAMERA_DISTANCE = 1.5;
const MIN_POINT_SIZE = 0.025;
const MAX_POINT_SIZE = 0.18;

export function createBoundsVectors(bounds: Points3dBounds) {
  return {
    min: new THREE.Vector3(...bounds.min),
    max: new THREE.Vector3(...bounds.max),
  };
}

export function createBoundsCenter(bounds: Points3dBounds) {
  const { min, max } = createBoundsVectors(bounds);
  return min.add(max).multiplyScalar(0.5);
}

export function createBoundsSize(bounds: Points3dBounds) {
  const { min, max } = createBoundsVectors(bounds);
  return max.sub(min);
}

export function createBoundsRadius(bounds: Points3dBounds) {
  return Math.max(createBoundsSize(bounds).length() * 0.5, 0.001);
}

export function computePointSize(bounds: Points3dBounds) {
  const diagonal = createBoundsSize(bounds).length();
  const idealSize = diagonal > 0 ? diagonal / 180 : MIN_POINT_SIZE;

  return Math.max(MIN_POINT_SIZE, Math.min(MAX_POINT_SIZE, idealSize));
}

export function createIntensityColorBuffer(intensity: Float32Array) {
  const colors = new Float32Array(intensity.length * 3);

  if (!intensity.length) {
    return colors;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of intensity) {
    if (!Number.isFinite(value)) {
      continue;
    }

    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    colors.fill(0.75);
    return colors;
  }

  for (let index = 0; index < intensity.length; index += 1) {
    const value = intensity[index];
    const normalized = Number.isFinite(value) ? (value - min) / (max - min) : 0;
    const base = index * 3;

    colors[base] = 0.18 + normalized * 0.76;
    colors[base + 1] = 0.44 + normalized * 0.36;
    colors[base + 2] = 0.95 - normalized * 0.7;
  }

  return colors;
}

export function fitPerspectiveCameraToBounds(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void } | null,
  bounds: Points3dBounds
) {
  const center = createBoundsCenter(bounds);
  const radius = createBoundsRadius(bounds);
  const fov = THREE.MathUtils.degToRad(camera.fov || 50);
  const distance = Math.max(
    MIN_CAMERA_DISTANCE,
    (radius / Math.tan(fov / 2)) * DEFAULT_BOUNDS_PADDING
  );

  const nextPosition = center
    .clone()
    .add(DEFAULT_CAMERA_DIRECTION.clone().multiplyScalar(distance));

  camera.position.copy(nextPosition);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 20;
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}
