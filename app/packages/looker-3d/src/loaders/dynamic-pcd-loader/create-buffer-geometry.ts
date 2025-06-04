import { BufferGeometry, Float32BufferAttribute } from "three";
import { computeMinMaxForScalarBufferAttribute } from "../../utils";
import {
  DynamicPCDBufferGeometryUserData,
  PCDAttributes,
  PCDHeader,
} from "./types";

/**
 * Creates a BufferGeometry from parsed PCD data.
 *
 * @param header - The PCD header containing field types and sizes
 * @param position - Array of position values (x, y, z triplets)
 * @param attributes - Object containing arrays for each attribute field
 * @returns A BufferGeometry with all attributes properly set
 */
export const createBufferGeometry = (
  header: PCDHeader,
  position: number[] | Float32Array,
  attributes: PCDAttributes
): BufferGeometry => {
  const geometry = new BufferGeometry();

  if (position.length) {
    geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  }

  for (const [name, arr] of Object.entries(attributes)) {
    if (!arr.length) continue;

    const fieldIndex = header.fields.indexOf(name);
    if (fieldIndex === -1) {
      console.warn(`Field "${name}" not found in header fields`);
      continue;
    }

    // todo: i think we can remove these special handlings
    if (name === "rgb") {
      geometry.setAttribute("rgb", new Float32BufferAttribute(arr, 3));
    } else if (name === "normal" || name === "normal_x") {
      geometry.setAttribute("normal", new Float32BufferAttribute(arr, 3));
    } else {
      // unforunately webgl has poor support for non-float-32 attributes,
      // so we just cast
      geometry.setAttribute(name, new Float32BufferAttribute(arr, 1));
    }
  }

  geometry.computeBoundingSphere();

  // compute min and max for all attributes, and store in BufferGeometry.userData
  const userData: DynamicPCDBufferGeometryUserData = {};

  for (const [name, arr] of Object.entries(geometry.attributes)) {
    if (name === "position") {
      continue;
    }

    userData[name] = computeMinMaxForScalarBufferAttribute(arr);
  }

  geometry.userData = userData;

  return geometry;
};
