import {
  BufferGeometry,
  Float32BufferAttribute,
  Int16BufferAttribute,
  Int32BufferAttribute,
  Int8BufferAttribute,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Uint8BufferAttribute,
} from "three";
import { computeMinMaxForScalarBufferAttribute } from "../../utils";
import {
  DynamicPCDBufferGeometryUserData,
  PCDAttributes,
  PCDFieldType,
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

    const fieldType = header.type[fieldIndex];
    const fieldSize = header.size[fieldIndex];

    // todo: i think we can remove these special handlings
    if (name === "rgb") {
      geometry.setAttribute("rgb", new Float32BufferAttribute(arr, 3));
    } else if (name === "normal" || name === "normal_x") {
      geometry.setAttribute("normal", new Float32BufferAttribute(arr, 3));
    } else {
      // use the appropriate buffer attribute based on type and size from header
      const bufferAttribute = createBufferAttribute(arr, fieldType, fieldSize);
      if (bufferAttribute) {
        geometry.setAttribute(name, bufferAttribute);
      }
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

/**
 * Creates the appropriate buffer attribute based on PCD field type and size.
 *
 * @param data - The data array
 * @param type - The PCD field type ('F', 'I', or 'U')
 * @param size - The size in bytes
 * @returns The appropriate BufferAttribute instance
 */
const createBufferAttribute = (
  data:
    | number[]
    | Float32Array
    | Int32Array
    | Uint32Array
    | Int8Array
    | Int16Array
    | Uint8Array
    | Uint16Array,
  type: PCDFieldType,
  size: number
) => {
  // Type 'F' = Float
  if (type === "F") {
    if (size === 8) {
      console.warn(`Unsupported float size ${size}, defaulting to Float32`);
    }

    return new Float32BufferAttribute(data, 1);
  }

  // Type 'I' = Signed Integer
  if (type === "I") {
    switch (size) {
      case 1:
        return new Int8BufferAttribute(new Int8Array(data), 1);
      case 2:
        return new Int16BufferAttribute(new Int16Array(data), 1);
      case 4:
        return new Int32BufferAttribute(new Int32Array(data), 1);
      default:
        console.warn(
          `Unsupported signed integer size ${size}, defaulting to Int32`
        );
        return new Int32BufferAttribute(new Int32Array(data), 1);
    }
  }

  // Type 'U' = Unsigned Integer
  if (type === "U") {
    switch (size) {
      case 1:
        return new Uint8BufferAttribute(new Uint8Array(data), 1);
      case 2:
        return new Uint16BufferAttribute(new Uint16Array(data), 1);
      case 4:
        return new Uint32BufferAttribute(new Uint32Array(data), 1);
      default:
        console.warn(
          `Unsupported unsigned integer size ${size}, defaulting to Uint32`
        );
        return new Uint32BufferAttribute(new Uint32Array(data), 1);
    }
  }

  console.warn(`Unknown PCD field type "${type}", defaulting to Float32`);

  return new Float32BufferAttribute(data, 1);
};
