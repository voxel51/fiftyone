import { DetectionLabel } from "@fiftyone/looker";
import { DETECTION } from "@fiftyone/utilities";
import { Euler, Quaternion } from "three";

export interface Coordinates3d {
  position: { x?: number; y?: number; z?: number };
  dimensions: { lx?: number; ly?: number; lz?: number };
  rotation: { rx?: number; ry?: number; rz?: number };
}

/**
 * Converts a [x, y, z, w] quaternion to [x, y, z] Euler radians (XYZ order).
 * Duplicated from `@fiftyone/looker-3d`'s `quaternionToRadians` rather than
 * imported: that package's barrel pulls in its full component graph (canvas,
 * plugin registration, ...), which needs `window` and breaks this module's
 * plain-node unit tests for what is otherwise a one-line pure conversion.
 */
const quaternionToRadians = (
  quaternion: [number, number, number, number],
): [number, number, number] => {
  const euler = new Euler().setFromQuaternion(
    new Quaternion(...quaternion),
    "XYZ",
  );
  return [euler.x, euler.y, euler.z];
};

/**
 * Builds `Coordinates3d` from a detection's stored geometry, or `null` if
 * it's missing the fields a 3D box needs.
 */
export const deriveTransformState = (
  label: DetectionLabel | null | undefined,
): Coordinates3d | null => {
  if (label?._cls !== DETECTION || !label.location || !label.dimensions) {
    return null;
  }

  const rotation = label.quaternion
    ? quaternionToRadians(label.quaternion)
    : (label.rotation ?? [0, 0, 0]);

  return {
    position: {
      x: label.location[0],
      y: label.location[1],
      z: label.location[2],
    },
    dimensions: {
      lx: label.dimensions[0],
      ly: label.dimensions[1],
      lz: label.dimensions[2],
    },
    rotation: { rx: rotation[0], ry: rotation[1], rz: rotation[2] },
  };
};
