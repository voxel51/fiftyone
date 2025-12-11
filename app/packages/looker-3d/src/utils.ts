import {
  Box3,
  type BufferAttribute,
  type Camera,
  Euler,
  type EulerOrder,
  type InterleavedBufferAttribute,
  Plane,
  Quaternion,
  type Raycaster,
  Vector3,
  type Vector3Tuple,
  type Vector4Tuple,
} from "three";
import { COLOR_POOL } from "./constants";
import type { FoMeshMaterial, FoPointcloudMaterialProps } from "./hooks";

export type FoSceneRawNode = {
  _type: string;
  name: string;
  visible: boolean;
  position: Vector3Tuple;
  quaternion: Vector4Tuple;
  scale: Vector3Tuple;
  defaultMaterial: FoMeshMaterial | FoPointcloudMaterialProps;
  children: FiftyoneSceneRawJson[];
};

export type FoCameraProps = {
  position: Vector3Tuple | null;
  lookAt: Vector3Tuple | null;
  up: "X" | "Y" | "Z";
  fov: number;
  aspect: number;
  near: number;
  far: number;
};

export type FoLightProps = Omit<Partial<FoSceneRawNode>, "_type"> & {
  color: string;
  intensity: number;
};

export type FoAmbientLightProps = FoLightProps & {
  _type: "AmbientLight";
};

export type FoPointLightProps = FoLightProps & {
  _type: "PointLight";
  distance: number;
  decay: number;
};

export type FoDirectionalLightProps = FoLightProps & {
  _type: "DirectionalLight";
  target: Vector3Tuple;
};

export type FoSpotLightProps = FoLightProps & {
  _type: "SpotLight";
  target: Vector3Tuple;
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
};

export type FoSceneBackground = {
  color: string | null;
  image: string | null;
  cube: [string, string, string, string, string, string] | null;
  intensity: number;
};

export type FiftyoneSceneRawJson = {
  background: FoSceneBackground | null;
  camera: FoCameraProps;
  lights: Array<
    | FoAmbientLightProps
    | FoDirectionalLightProps
    | FoPointLightProps
    | FoSpotLightProps
  > | null;
} & FoSceneRawNode;

class InvalidSceneError extends Error {
  constructor() {
    super("Invalid scene");
  }
}

/**
 * Reads a raw JSON scene from FiftyOne and returns counts
 * of different media types in the scene.
 *
 * @param scene - The FiftyOne scene JSON object
 * @returns Object containing counts of different media types
 */
export const getFiftyoneSceneSummary = (scene: FiftyoneSceneRawJson) => {
  if (
    !Object.hasOwn(scene, "_type") ||
    !Object.hasOwn(scene, "name") ||
    !Object.hasOwn(scene, "visible") ||
    !Object.hasOwn(scene, "position") ||
    !Object.hasOwn(scene, "quaternion") ||
    !Object.hasOwn(scene, "scale") ||
    !Object.hasOwn(scene, "children") ||
    !Array.isArray(scene.children)
  ) {
    throw new InvalidSceneError();
  }

  let meshCount = 0;
  let pointcloudCount = 0;
  let shapeCount = 0;
  let unknownCount = 0;

  for (const child of scene.children) {
    if (child._type.endsWith("Mesh")) {
      meshCount += 1;
    } else if (child._type.endsWith("PointCloud")) {
      pointcloudCount += 1;
    } else if (child._type.endsWith("Geometry")) {
      shapeCount += 1;
    } else {
      unknownCount += 1;
    }

    if (child.children.length > 0) {
      const childSummary = getFiftyoneSceneSummary(child);
      meshCount += childSummary.meshCount;
      pointcloudCount += childSummary.pointcloudCount;
      shapeCount += childSummary.shapeCount;
      unknownCount += childSummary.unknownCount;
    }
  }

  return {
    meshCount,
    pointcloudCount,
    shapeCount,
    unknownCount,
  };
};

/**
 * Converts degrees to radians.
 *
 * @param degrees - The angle in degrees
 * @returns The angle in radians
 */
export const deg2rad = (degrees: number) => degrees * (Math.PI / 180);

/**
 * Converts an array of degrees to an array of radians.
 *
 * @param degreesArr - Array of angles in degrees
 * @returns Array of angles in radians
 */
export const toEulerFromDegreesArray = (degreesArr: Vector3Tuple) => {
  return degreesArr.map(deg2rad) as Vector3Tuple;
};

/**
 * Computes the min and max values for a color buffer attribute.
 *
 * @param colorAttribute - The color buffer attribute to analyze
 * @returns Object containing min and max values
 */
export const computeMinMaxForColorBufferAttribute = (
  colorAttribute: BufferAttribute | InterleavedBufferAttribute
) => {
  let minX = Infinity,
    maxX = -Infinity;

  for (let i = 0; i < colorAttribute.count; i++) {
    const x = colorAttribute.getX(i);
    minX = Math.min(x, minX);
    maxX = Math.max(x, maxX);
  }

  return { min: minX, max: maxX };
};

/**
 * Computes the min and max values for a scalar buffer attribute (like intensity in pcd)
 *
 * @param attribute - The scalar buffer attribute to analyze
 * @returns Object containing min and max values
 */
export const computeMinMaxForScalarBufferAttribute = (
  attribute: BufferAttribute | InterleavedBufferAttribute
) => {
  const a = attribute.array;
  let mn = Infinity,
    mx = -Infinity;
  for (let i = 0; i < a.length; i += attribute.itemSize) {
    const v = a[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { min: mn, max: mx };
};

/**
 * Gets a color from the color pool based on a string hash.
 *
 * @param str - The string to hash
 * @returns A color from the color pool
 */
export const getColorFromPoolBasedOnHash = (str: string) => {
  const hash = str.split("").reduce((acc, char, idx) => {
    const charCode = char.charCodeAt(0);
    return acc + charCode * idx;
  }, 0);
  return COLOR_POOL[hash % COLOR_POOL.length];
};

/**
 * Calculates a quaternion to align a grid with a custom up vector.
 *
 * @param upVectorNormalized - The normalized up vector
 * @returns A quaternion representing the rotation
 */
export const getGridQuaternionFromUpVector = (
  upVectorNormalized: Vector3,
  targetNormal: Vector3 = new Vector3(0, 1, 0)
) => {
  const from = targetNormal.clone().normalize();
  const to = upVectorNormalized.clone();
  return new Quaternion().setFromUnitVectors(from, to);
};

/**
 * Converts a pointer event to Normalized Device Coordinates (NDC).
 * NDC coordinates range from -1 to 1 in both x and y directions,
 * with (0, 0) at the center of the canvas.
 *
 * @param ev - The pointer event to convert
 * @param canvas - The HTML canvas element to get bounds from
 * @returns An object with x and y coordinates in NDC space
 */
export function toNDC(ev: PointerEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((ev.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

/**
 * Calculates the intersection point between a ray and a plane.
 *
 * @param raycaster - The THREE.js raycaster instance
 * @param camera - The THREE.js camera
 * @param ndc - Normalized device coordinates
 * @param plane - The THREE.js plane to intersect with
 * @returns The intersection point if it exists, null otherwise
 */
export function getPlaneIntersection(
  raycaster: Raycaster,
  camera: Camera,
  ndc: { x: number; y: number },
  plane: Plane
): Vector3 | null {
  raycaster.setFromCamera(ndc as any, camera);
  const point = new Vector3();
  if (raycaster.ray.intersectPlane(plane, point)) {
    return point;
  }
  return null;
}

/**
 * Creates a THREE.js plane from normal and constant values.
 *
 * @param normal - The plane normal vector
 * @param constant - The plane constant
 * @returns A new THREE.js plane
 */
export function createPlane(normal: Vector3, constant: number): Plane {
  return new Plane(normal.clone().normalize(), -constant);
}

/**
 * Checks if a pointer event matches the specified button.
 *
 * @param ev - The pointer event to check
 * @param button - The button number to match (0 = left, 1 = middle, 2 = right)
 * @returns True if the button matches, false otherwise
 */
export function isButtonMatch(ev: PointerEvent, button: number): boolean {
  return ev.button === button;
}

/**
 * Creates a THREE.js plane from stored position and quaternion state.
 *
 * @param position - The plane position as [x, y, z]
 * @param quaternion - The plane rotation as [x, y, z, w]
 * @returns A new THREE.js plane
 */
export function getPlaneFromPositionAndQuaternion(
  position: [number, number, number],
  quaternion: [number, number, number, number]
): Plane {
  const pos = new Vector3(...position);
  const quat = new Quaternion(...quaternion);

  // Extract normal from quaternion by rotating the Z-axis
  const normal = new Vector3(0, 0, 1).applyQuaternion(quat).normalize();

  // Create plane with normal and position
  const plane = new Plane();
  plane.setFromNormalAndCoplanarPoint(normal, pos);

  return plane;
}

/**
 * Expands a bounding box by a specified safety margin factor.
 * The expansion is applied uniformly in all directions from the center.
 *
 * @param boundingBox - The original bounding box to expand
 * @param safetyMargin - The expansion factor (e.g., 1.5 for 1.5x expansion)
 * @returns A new expanded bounding box
 */
export function expandBoundingBox(
  boundingBox: Box3,
  safetyMargin: number = 1.5
): Box3 {
  if (!boundingBox || boundingBox.isEmpty()) {
    return boundingBox;
  }

  const center = boundingBox.getCenter(new Vector3());
  const size = boundingBox.getSize(new Vector3());

  const expandedSize = size.clone().multiplyScalar(safetyMargin);

  const expandedBox = new Box3();
  expandedBox.setFromCenterAndSize(center, expandedSize);

  return expandedBox;
}

/**
 * Converts Euler angles (in degrees) to a quaternion.
 *
 * @param eulerAngles - Array of [x, y, z] Euler angles in degrees
 * @param order - The order of rotations (default: 'XYZ')
 * @returns Quaternion as [x, y, z, w] array
 */
export function eulerToQuaternion(
  eulerAngles: [number, number, number],
  order: EulerOrder = "XYZ"
): [number, number, number, number] {
  const euler = new Euler(
    deg2rad(eulerAngles[0]),
    deg2rad(eulerAngles[1]),
    deg2rad(eulerAngles[2]),
    order
  );
  const quaternion = new Quaternion();
  quaternion.setFromEuler(euler);
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

/**
 * Converts a quaternion to Euler angles (in degrees).
 *
 * @param quaternion - Quaternion as [x, y, z, w] array
 * @param order - The order of rotations (default: 'XYZ')
 * @returns Array of [x, y, z] Euler angles in degrees
 */
export function quaternionToEuler(
  quaternion: [number, number, number, number],
  order: EulerOrder = "XYZ"
): [number, number, number] {
  const q = new Quaternion(
    quaternion[0],
    quaternion[1],
    quaternion[2],
    quaternion[3]
  );
  const euler = new Euler();
  euler.setFromQuaternion(q, order);
  return [
    (euler.x * 180) / Math.PI,
    (euler.y * 180) / Math.PI,
    (euler.z * 180) / Math.PI,
  ];
}

/**
 * Converts a quaternion to Euler angles (in radians).
 *
 * @param quaternion - Quaternion as [x, y, z, w] array
 * @param order - The order of rotations (default: 'XYZ')
 * @returns Array of [x, y, z] Euler angles in radians
 */
export function quaternionToRadians(
  quaternion: [number, number, number, number],
  order: EulerOrder = "XYZ"
): [number, number, number] {
  const q = new Quaternion(
    quaternion[0],
    quaternion[1],
    quaternion[2],
    quaternion[3]
  );
  const euler = new Euler();
  euler.setFromQuaternion(q, order);
  return [euler.x, euler.y, euler.z];
}

/**
 * Validates a single 3D point to ensure it's a valid array of 3 numbers
 */
export const isValidPoint3d = (point: unknown): point is Vector3Tuple => {
  return (
    point !== null &&
    point !== undefined &&
    Array.isArray(point) &&
    point.length === 3 &&
    point.every(
      (coord) => typeof coord === "number" && !isNaN(coord) && isFinite(coord)
    )
  );
};

/**
 * Validates an array of 3D points and filters out invalid ones
 */
export const validatePoints3d = (points: unknown[]): Vector3Tuple[] => {
  return points.filter(isValidPoint3d);
};

/**
 * Validates a points3d array (array of point arrays) and filters out invalid segments
 */
export const validatePoints3dArray = (
  points3d: Vector3Tuple[][]
): Vector3Tuple[][] => {
  return points3d.filter(
    (pts) =>
      pts && Array.isArray(pts) && pts.length >= 3 && pts.every(isValidPoint3d)
  );
};

/**
 * Validates a single segment (array of points) for polyline rendering
 * This is used in index.tsx for filtering segments
 */
export const isValidPolylineSegment = (
  segment: unknown
): segment is Vector3Tuple[] => {
  return (
    segment !== null &&
    segment !== undefined &&
    Array.isArray(segment) &&
    segment.length > 0 &&
    segment.every(isValidPoint3d)
  );
};

/**
 * Computes an axis-aligned bounding box for a flat array of 3D points.
 * Returns the center location and dimensions.
 */
export const getAxisAlignedBoundingBoxForPoints3d = (
  points3d: Vector3Tuple[]
): { location: Vector3Tuple; dimensions: Vector3Tuple } => {
  if (!points3d || points3d.length === 0) {
    return {
      location: [0, 0, 0],
      dimensions: [0, 0, 0],
    };
  }

  const validPoints = points3d.filter(
    (pt) =>
      pt &&
      Array.isArray(pt) &&
      pt.length === 3 &&
      pt.every((v) => typeof v === "number" && isFinite(v))
  );

  if (validPoints.length === 0) {
    return {
      location: [0, 0, 0],
      dimensions: [0, 0, 0],
    };
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const [x, y, z] of validPoints) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;

  return {
    location: [centerX, centerY, centerZ],
    dimensions: [width, height, depth],
  };
};

/**
 * Calculates an optimal camera position for viewing a 3D scene based on an up vector.
 *
 * The function positions a camera to view a bounding box (defined by center and size)
 * from a perspective that respects the specified up vector direction. It supports two
 * view types: "top" for a directly overhead view, and "pov" for a perspective view
 * at a slight angle (specifically optimized for automotive/ego-centric scenes).
 *
 * @param center - The center point of the bounding box to frame
 * @param size - The dimensions (width, height, depth) of the bounding box
 * @param upVector - The desired up direction for the camera (will be normalized)
 * @param distanceMultiplier - Multiplier for the base distance (default: 2.5).
 *                              Distance is calculated as max(size.x, size.y, size.z) * multiplier
 * @param viewType - Type of view: "top" for overhead view along up vector,
 *                   or "pov" for perspective view at ~5-degree angle (default: "pov")
 *
 * @returns A Vector3 representing the calculated camera position
 * ```
 */
export const calculateCameraPositionForUpVector = (
  center: Vector3,
  size: Vector3,
  upVector: Vector3,
  distanceMultiplier: number = 2.5,
  viewType: "top" | "pov" = "pov"
): Vector3 => {
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = maxSize * distanceMultiplier;

  const upDir = upVector.clone().normalize();

  if (viewType === "top") {
    // camera positioned directly above/below along the up vector
    return center.clone().add(upDir.multiplyScalar(distance));
  }

  // pov view - camera positioned at a ~5-degree angle for more natural perspective
  const angle = Math.PI / 32;

  // division by arbitrary numbers to make the camera position more natural for "automotive-centered" ego view
  // note: this is not a perfect solution as it doesn't account for non-automotive scenes
  // but "ego" view is a special case more natural to automotive scenes
  // ideally we want three views, ego, top, and pov...
  // for now we have only ego/pov + top
  const verticalDist = Math.abs(Math.sin(angle) * distance) / 6;
  const horizontalDist = Math.abs(Math.cos(angle) * distance) / 15;

  // 1. choose a world-forward direction (Y up ideally, else X)
  let worldForward = new Vector3(0, 1, 0);
  if (Math.abs(upDir.dot(worldForward)) > 0.999) {
    worldForward.set(1, 0, 0);
  }
  // If Z is up, use -Y as world forward to ensure +X is on the right
  if (upDir.equals(new Vector3(0, 0, 1))) {
    worldForward.set(0, -1, 0);
  }
  // If Y is up, use Z as world forward to ensure +X is on the right
  else if (upDir.equals(new Vector3(0, 1, 0))) {
    worldForward.set(0, 0, 1);
  }
  // If X is up, use Y as world forward to ensure +Z is on the right (this is arbitrary)
  else if (upDir.equals(new Vector3(1, 0, 0))) {
    worldForward.set(0, 1, 0);
  }

  // 2. project that forward into the horizontal plane (perp. to upDir)
  const proj = worldForward
    .clone()
    .sub(upDir.clone().multiplyScalar(worldForward.dot(upDir)))
    .normalize();

  // 3. build camera position: center + up‐offset + horizontal‐offset
  return center
    .clone()
    .add(upDir.multiplyScalar(verticalDist))
    .add(proj.multiplyScalar(horizontalDist));
};
