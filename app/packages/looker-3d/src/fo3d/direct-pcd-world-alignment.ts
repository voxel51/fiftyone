import { Euler, Quaternion, Vector3 } from "three";
import type { CuboidTransformData } from "../annotation/types";
import type {
  GroupStaticTransformResponse,
  StaticTransform,
} from "../frustum/types";

/** The fixed display target for grouped direct PCD alignment. */
export const WORLD_FRAME = "world";

/** Static transforms keyed by either native slice or sample ID. */
export type DirectPcdWorldTransforms = Readonly<
  Record<string, StaticTransform>
>;

interface DirectPcdWorldAlignment {
  readonly transformsBySlice: DirectPcdWorldTransforms;
  readonly unresolvedSlices: readonly string[];
}

const isFiniteTuple = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((item) => typeof item === "number" && Number.isFinite(item));

const normalizeStaticTransform = (
  value: unknown,
  sourceFrame: string,
): StaticTransform | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const transform = value as Partial<StaticTransform>;
  if (
    transform.source_frame !== sourceFrame ||
    transform.target_frame !== WORLD_FRAME ||
    !isFiniteTuple(transform.translation, 3) ||
    !isFiniteTuple(transform.quaternion, 4)
  ) {
    return null;
  }

  const quaternion = new Quaternion(...transform.quaternion);
  if (!Number.isFinite(quaternion.lengthSq()) || quaternion.lengthSq() === 0) {
    return null;
  }
  quaternion.normalize();

  return {
    source_frame: sourceFrame,
    target_frame: WORLD_FRAME,
    translation: [...transform.translation] as StaticTransform["translation"],
    quaternion: quaternion.toArray() as StaticTransform["quaternion"],
  };
};

/**
 * Validates the group transform response for the requested native PCD frames.
 */
export const resolveDirectPcdWorldAlignment = (
  response: GroupStaticTransformResponse,
  sliceNames: readonly string[],
): DirectPcdWorldAlignment => {
  if (!response.has_static_transforms) {
    return {
      transformsBySlice: {},
      unresolvedSlices: [],
    };
  }

  const transformsBySlice: Record<string, StaticTransform> = {};
  const unresolvedSlices: string[] = [];

  for (const sliceName of sliceNames) {
    const result = response.results[sliceName];
    const transform =
      result && "staticTransform" in result
        ? normalizeStaticTransform(result.staticTransform, sliceName)
        : null;

    if (transform) {
      transformsBySlice[sliceName] = transform;
    } else {
      unresolvedSlices.push(sliceName);
    }
  }

  return {
    transformsBySlice,
    unresolvedSlices,
  };
};

const getCuboidQuaternion = (cuboid: CuboidTransformData) =>
  cuboid.quaternion
    ? new Quaternion(...cuboid.quaternion)
    : new Quaternion().setFromEuler(
        new Euler(...(cuboid.rotation ?? [0, 0, 0])),
      );

/** Converts a sensor-local cuboid into the aligned world display frame. */
export const transformCuboidToWorldFrame = (
  cuboid: CuboidTransformData,
  nativeToWorld: StaticTransform,
): CuboidTransformData => {
  const frameQuaternion = new Quaternion(
    ...nativeToWorld.quaternion,
  ).normalize();
  const worldLocation = new Vector3(...cuboid.location)
    .applyQuaternion(frameQuaternion)
    .add(new Vector3(...nativeToWorld.translation));
  const worldQuaternion = frameQuaternion
    .clone()
    .multiply(getCuboidQuaternion(cuboid))
    .normalize();
  const worldEuler = new Euler().setFromQuaternion(worldQuaternion);

  return {
    ...cuboid,
    location: worldLocation.toArray() as CuboidTransformData["location"],
    dimensions: [...cuboid.dimensions] as CuboidTransformData["dimensions"],
    rotation: [worldEuler.x, worldEuler.y, worldEuler.z],
    quaternion: worldQuaternion.toArray() as CuboidTransformData["quaternion"],
  };
};

/**
 * Converts a cuboid manipulated in the aligned world display back into the
 * writable PCD slice's native sensor frame.
 */
export const transformCuboidToNativeFrame = (
  cuboid: CuboidTransformData,
  nativeToWorld: StaticTransform,
): CuboidTransformData => {
  const frameQuaternion = new Quaternion(
    ...nativeToWorld.quaternion,
  ).normalize();
  const worldToNativeQuaternion = frameQuaternion.clone().invert();
  const nativeLocation = new Vector3(...cuboid.location)
    .sub(new Vector3(...nativeToWorld.translation))
    .applyQuaternion(worldToNativeQuaternion);

  const worldQuaternion = getCuboidQuaternion(cuboid);
  const nativeQuaternion = worldToNativeQuaternion
    .clone()
    .multiply(worldQuaternion)
    .normalize();
  const nativeEuler = new Euler().setFromQuaternion(nativeQuaternion);

  return {
    ...cuboid,
    location: nativeLocation.toArray() as CuboidTransformData["location"],
    dimensions: [...cuboid.dimensions] as CuboidTransformData["dimensions"],
    rotation: [nativeEuler.x, nativeEuler.y, nativeEuler.z],
    quaternion: nativeQuaternion.toArray() as CuboidTransformData["quaternion"],
  };
};
