import {
  type BufferAttribute,
  type Camera,
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
export const getGridQuaternionFromUpVector = (upVectorNormalized: Vector3) => {
  // calculate angle between custom up direction and default up direction (y-axis in three-js)
  const angle = Math.acos(upVectorNormalized.dot(new Vector3(0, 1, 0)));

  // calculate axis perpendicular to both the default up direction and the custom up direction
  const axis = new Vector3()
    .crossVectors(new Vector3(0, 1, 0), upVectorNormalized)
    .normalize();

  // quaternion to represent the rotation around an axis perpendicular to both the default up direction and the custom up direction
  return new Quaternion().setFromAxisAngle(axis, angle);
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
 * Converts a normal vector to a quaternion that represents the rotation
 * needed to align the Z-axis with the given normal.
 *
 * @param normal - The normal vector to convert to quaternion
 * @returns A quaternion representing the rotation
 */
export function getQuaternionForNormal(normal: Vector3): Quaternion {
  const quaternion = new Quaternion();
  const up = new Vector3(0, 0, 1);

  // If normal is already pointing up, return identity quaternion
  if (normal.equals(up)) {
    return quaternion;
  }

  // If normal is pointing down, rotate 180 degrees around X axis
  if (normal.equals(new Vector3(0, 0, -1))) {
    quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
    return quaternion;
  }

  // Calculate rotation axis (cross product of up and normal)
  const axis = new Vector3().crossVectors(up, normal).normalize();

  // Calculate rotation angle (dot product gives us the angle)
  const angle = Math.acos(Math.max(-1, Math.min(1, up.dot(normal))));

  quaternion.setFromAxisAngle(axis, angle);
  return quaternion;
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
