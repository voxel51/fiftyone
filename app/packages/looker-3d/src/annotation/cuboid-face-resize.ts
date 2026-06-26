import * as THREE from "three";

export const CUBOID_RESIZE_FACES = [
  "+x",
  "-x",
  "+y",
  "-y",
  "+z",
  "-z",
] as const;

export type CuboidResizeFace = (typeof CUBOID_RESIZE_FACES)[number];

export const MIN_CUBOID_FACE_RESIZE_DIMENSION = 1e-6;

const FACE_TO_AXIS: Record<
  CuboidResizeFace,
  { axis: 0 | 1 | 2; sign: 1 | -1 }
> = {
  "+x": { axis: 0, sign: 1 },
  "-x": { axis: 0, sign: -1 },
  "+y": { axis: 1, sign: 1 },
  "-y": { axis: 1, sign: -1 },
  "+z": { axis: 2, sign: 1 },
  "-z": { axis: 2, sign: -1 },
};

const EPSILON = 1e-10;

export function getCuboidResizeDimensionMagnitudes(
  dimensions: THREE.Vector3Tuple,
): THREE.Vector3Tuple {
  return [
    Math.abs(dimensions[0]),
    Math.abs(dimensions[1]),
    Math.abs(dimensions[2]),
  ];
}

export function isValidCuboidResizeDimensions(
  dimensions: THREE.Vector3Tuple,
): boolean {
  return getCuboidResizeDimensionMagnitudes(dimensions).every(
    (dimension) =>
      Number.isFinite(dimension) &&
      dimension >= MIN_CUBOID_FACE_RESIZE_DIMENSION,
  );
}

export function getCuboidResizeFaceFromNormal(
  normal: THREE.Vector3 | null | undefined,
): CuboidResizeFace | null {
  if (!normal) {
    return null;
  }

  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);

  if (absX < EPSILON && absY < EPSILON && absZ < EPSILON) {
    return null;
  }

  if (absX >= absY && absX >= absZ) {
    return normal.x >= 0 ? "+x" : "-x";
  }

  if (absY >= absX && absY >= absZ) {
    return normal.y >= 0 ? "+y" : "-y";
  }

  return normal.z >= 0 ? "+z" : "-z";
}

export function getCuboidResizeFaceAxis(
  face: CuboidResizeFace,
): (typeof FACE_TO_AXIS)[CuboidResizeFace] {
  return FACE_TO_AXIS[face];
}

export function getCuboidResizeQuaternion({
  quaternion,
  rotation,
}: {
  quaternion?: THREE.Vector4Tuple | null;
  rotation?: THREE.Vector3Tuple | null;
}): THREE.Quaternion {
  if (
    quaternion?.length === 4 &&
    quaternion.every((value) => Number.isFinite(value))
  ) {
    const result = new THREE.Quaternion(...quaternion);
    if (result.lengthSq() > EPSILON) {
      return result.normalize();
    }
  }

  if (
    rotation?.length === 3 &&
    rotation.every((value) => Number.isFinite(value))
  ) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  }

  return new THREE.Quaternion();
}

export function getCuboidResizeFaceWorldNormal(
  face: CuboidResizeFace,
  orientation: THREE.Quaternion,
): THREE.Vector3 {
  const { axis, sign } = FACE_TO_AXIS[face];
  const localNormal = new THREE.Vector3();
  localNormal.setComponent(axis, sign);

  return localNormal.applyQuaternion(orientation).normalize();
}

export function getCuboidFaceResizeDragPlaneNormal({
  faceWorldNormal,
  cameraDirection,
  cameraUp,
}: {
  faceWorldNormal: THREE.Vector3;
  cameraDirection: THREE.Vector3;
  cameraUp: THREE.Vector3;
}): THREE.Vector3 {
  const normalizedFaceNormal = faceWorldNormal.clone().normalize();
  const projectedCameraDirection = cameraDirection
    .clone()
    .normalize()
    .projectOnPlane(normalizedFaceNormal);

  if (projectedCameraDirection.lengthSq() > EPSILON) {
    return projectedCameraDirection.normalize();
  }

  const projectedCameraUp = cameraUp
    .clone()
    .normalize()
    .projectOnPlane(normalizedFaceNormal);

  if (projectedCameraUp.lengthSq() > EPSILON) {
    return projectedCameraUp.normalize();
  }

  const fallbackAxis =
    Math.abs(normalizedFaceNormal.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);

  return fallbackAxis.projectOnPlane(normalizedFaceNormal).normalize();
}

export function computeCuboidFaceResizeDelta({
  face,
  dimensions,
  dragDistance,
  quaternion,
  rotation,
  useLegacyCoordinates = false,
  minDimension = MIN_CUBOID_FACE_RESIZE_DIMENSION,
}: {
  face: CuboidResizeFace;
  dimensions: THREE.Vector3Tuple;
  dragDistance: number;
  quaternion?: THREE.Vector4Tuple | null;
  rotation?: THREE.Vector3Tuple | null;
  useLegacyCoordinates?: boolean;
  minDimension?: number;
}): {
  dimensionsDelta: THREE.Vector3Tuple;
  positionDelta: THREE.Vector3Tuple;
  centerDelta: THREE.Vector3Tuple;
  resizedDimensions: THREE.Vector3Tuple;
} {
  const { axis } = FACE_TO_AXIS[face];
  const oldSignedDimension = dimensions[axis];
  const dimensionSign = oldSignedDimension < 0 ? -1 : 1;
  const oldDimensionMagnitude =
    getCuboidResizeDimensionMagnitudes(dimensions)[axis];
  const clampedNewDimensionMagnitude = Math.max(
    minDimension,
    oldDimensionMagnitude + dragDistance,
  );
  const clampedMagnitudeDelta =
    clampedNewDimensionMagnitude - oldDimensionMagnitude;
  const dimensionsDelta: THREE.Vector3Tuple = [0, 0, 0];
  dimensionsDelta[axis] = dimensionSign * clampedMagnitudeDelta;

  const orientation = getCuboidResizeQuaternion({ quaternion, rotation });
  const faceWorldNormal = getCuboidResizeFaceWorldNormal(face, orientation);
  const centerDeltaVector = faceWorldNormal.multiplyScalar(
    clampedMagnitudeDelta / 2,
  );
  const positionDelta: THREE.Vector3Tuple = centerDeltaVector.toArray();

  if (useLegacyCoordinates) {
    positionDelta[1] += dimensionsDelta[1] / 2;
  }

  return {
    dimensionsDelta,
    positionDelta,
    centerDelta: centerDeltaVector.toArray(),
    resizedDimensions: [
      dimensions[0] + dimensionsDelta[0],
      dimensions[1] + dimensionsDelta[1],
      dimensions[2] + dimensionsDelta[2],
    ],
  };
}
