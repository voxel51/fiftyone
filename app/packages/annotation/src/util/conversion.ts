import pako from "pako";

const validateArrayShape = (arr: Float32Array, shape: number[]): void => {
  if (shape.length === 0 || shape.some((d) => !Number.isInteger(d) || d < 0)) {
    throw new Error(`Invalid numpy shape: ${JSON.stringify(shape)}`);
  }

  const expectedSize = shape.reduce((size, d) => size * d, 1);
  if (expectedSize !== arr.length) {
    throw new Error(
      `Shape ${JSON.stringify(shape)} does not match array length ${arr.length}`
    );
  }
};

const createNumpyHeader = (shape: number[]) => {
  let header =
    "{'descr': '|u1', 'fortran_order': False, 'shape': (" +
    shape.join(", ") +
    (shape.length === 1 ? "," : "") +
    "), }";

  const padLen = (64 - ((10 + header.length + 1) % 64)) % 64;
  header += " ".repeat(padLen) + "\n";

  const enc = new TextEncoder();
  const headerBytes = enc.encode(header);

  const out = new Uint8Array(10 + headerBytes.length);

  out.set([
    0x93,
    0x4e,
    0x55,
    0x4d,
    0x50,
    0x59, // \x93NUMPY
    0x01,
    0x00,
    headerBytes.length & 0xff,
    (headerBytes.length >> 8) & 0xff,
  ]);

  out.set(headerBytes, 10);

  return out;
};

/**
 * Convert a {@link Float32Array} to a b64-encoded compressed uint8 numpy array.
 *
 * This method is consistent with the format produced by server-side
 * mask serialization.
 *
 * @param arr Array to convert
 * @param shape Shape of array
 */
export const float32ToCompressedNumpy = (
  arr: Float32Array,
  shape: number[]
): string => {
  validateArrayShape(arr, shape);

  // cast to uint8
  const intArray = new Uint8Array(arr.length);

  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];

    if (!Number.isFinite(v)) {
      throw new Error(`Invalid float at index ${i}: ${v}`);
    }

    // threshold values at 0.5
    intArray[i] = v < 0 ? 0 : v > 0.5 ? 1 : 0;
  }

  // construct full array
  const header = createNumpyHeader(shape);

  const numpyArray = new Uint8Array(header.length + intArray.length);
  numpyArray.set(header, 0);
  numpyArray.set(intArray, header.length);

  const compressed = pako.deflate(numpyArray);

  // convert to b64
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < compressed.length; i += chunk) {
    binary += String.fromCharCode(...compressed.subarray(i, i + chunk));
  }

  return btoa(binary);
};
