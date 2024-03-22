import {
  BufferAttribute,
  InterleavedBufferAttribute,
  Quaternion,
  Vector3,
  Vector3Tuple,
  Vector4Tuple,
} from "three";
import { COLOR_POOL } from "./constants";
import { FoMeshMaterial, FoPointcloudMaterialProps } from "./hooks";

export type FiftyoneSceneRawNode = {
  _type: string;
  name: string;
  visible: boolean;
  position: Vector3Tuple;
  quaternion: Vector4Tuple;
  scale: Vector3Tuple;
  defaultMaterial: FoMeshMaterial | FoPointcloudMaterialProps;
  children: FiftyoneSceneRawJson[];
};

export type FiftyoneSceneCameraProps = {
  position: Vector3Tuple | null;
  lookAt: Vector3Tuple | null;
  up: "X" | "Y" | "Z";
  fov: number;
  aspect: number;
  near: number;
  far: number;
  backgroundImagePath: number;
};

export type FiftyoneSceneLightProps = Omit<FiftyoneSceneRawNode, "_type"> & {
  color: string;
  intensity: string;
};

export type FiftyoneSceneAmbientLightProps = FiftyoneSceneLightProps & {
  _type: "AmbientLight";
};

export type FiftyoneScenePointLightProps = FiftyoneSceneLightProps & {
  _type: "PointLight";
  distance: number;
  decay: number;
};

export type FiftyoneSceneDirectionalLightProps = FiftyoneSceneLightProps & {
  _type: "DirectionalLight";
  target: Vector3Tuple;
};

export type FiftyoneSceneSpotLightProps = FiftyoneSceneLightProps & {
  _type: "SpotLight";
  target: Vector3Tuple;
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
};

export type FiftyoneSceneRawJson = {
  camera: FiftyoneSceneCameraProps;
  lights: Array<
    | FiftyoneSceneAmbientLightProps
    | FiftyoneSceneDirectionalLightProps
    | FiftyoneScenePointLightProps
    | FiftyoneSceneSpotLightProps
  > | null;
} & FiftyoneSceneRawNode;

class InvalidSceneError extends Error {
  constructor() {
    super("Invalid scene");
  }
}

/**
 * Reads a raw JSON scene from FiftyOne and returns counts
 * of different media types in the scene.
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
  let unknownCount = 0;

  for (const child of scene.children) {
    if (child["_type"].endsWith("Mesh")) {
      meshCount += 1;
    } else if (child["_type"].endsWith("Pointcloud")) {
      pointcloudCount += 1;
    } else {
      unknownCount += 1;
    }

    if (child.children.length > 0) {
      const childSummary = getFiftyoneSceneSummary(child);
      meshCount += childSummary.meshCount;
      pointcloudCount += childSummary.pointcloudCount;
      unknownCount += childSummary.unknownCount;
    }
  }

  return {
    meshCount,
    pointcloudCount,
    unknownCount,
  };
};

/**
 * Converts degrees to radians.
 */
export const deg2rad = (degrees: number) => degrees * (Math.PI / 180);

/**
 * Converts an array of degrees to an array of radians.
 */
export const toEulerFromDegreesArray = (degreesArr: Vector3Tuple) => {
  return degreesArr.map(deg2rad) as Vector3Tuple;
};

/**
 * Computes the min and max values for a color buffer attribute.
 */
export const computeMinMaxForColorBufferAttribute = (
  colorAttribute: BufferAttribute | InterleavedBufferAttribute
) => {
  let minX = 0;
  let maxX = 0;

  for (let i = 0; i < colorAttribute.count; i++) {
    const x = colorAttribute.getX(i);
    minX = Math.min(x, minX);
    maxX = Math.max(x, maxX);
  }

  return { min: minX, max: maxX };
};

export const getColorFromPoolBasedOnHash = (str: string) => {
  const hash = str.split("").reduce((acc, char, idx) => {
    const charCode = char.charCodeAt(0);
    return acc + charCode * idx;
  }, 0);
  return COLOR_POOL[hash % COLOR_POOL.length];
};

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
