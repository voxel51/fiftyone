/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Buffer } from "buffer";
import pako from "./pako.js";

export { deserialize };

export const ARRAY_TYPES = {
  Uint8Array,
  Uint8ClampedArray,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
};

export type TypedArray =
  | Uint8Array
  | Uint8ClampedArray
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

export interface OverlayMask {
  buffer: ArrayBuffer;
  shape: [number, number];
  channels: number;
  arrayType: keyof typeof ARRAY_TYPES;
}

const DATA_TYPES = {
  // < = little-endian, > = big-endian, | = host architecture
  // we assume hosts are little-endian (like x86) so big-endian types are only
  // supported for 8-bit integers, where endianness doesn't matter
  "|b1": Uint8Array,
  "<b1": Uint8Array,
  ">b1": Uint8Array,
  "|u1": Uint8Array,
  "<u1": Uint8Array,
  ">u1": Uint8Array,
  "|i1": Int8Array,
  "<i1": Int8Array,
  ">i1": Int8Array,

  "|u2": Uint16Array,
  "<u2": Uint16Array,
  "|i2": Int16Array,
  "<i2": Int16Array,

  "|u4": Uint32Array,
  "<u4": Uint32Array,
  "|i4": Int32Array,
  "<i4": Int32Array,

  "|u8": convert64to32Array(Uint32Array),
  "<u8": convert64to32Array(Uint32Array),
  "|i8": convert64to32Array(Int32Array),
  "<i8": convert64to32Array(Int32Array),

  "<f4": Float32Array,
  "|f4": Float32Array,

  "<f8": Float64Array,
  "|f8": Float64Array,
};

/**
 * Polyfill to convert a 64-bit integer array to a 32-bit integer array. This
 * assumes that no element actually requires more than 32 bits to store, which
 * should be a safe assumption for our purposes.
 */
function convert64to32Array(
  TargetArrayType: typeof Uint32Array | typeof Int32Array
) {
  // we only need the 3-argument constructor to be implemented. For details:
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray
  const makeArray = function (
    buffer: ArrayBuffer,
    byteOffset: number,
    length: number
  ) {
    // view buffer as 32-bit type and copy the 4 lowest bytes out of every 8
    // bytes into a new array (assumes little-endian)
    const source = new TargetArrayType(buffer, byteOffset, length * 2);
    const target = new TargetArrayType(source.length);
    for (let i = 0; i < target.length; i++) {
      target[i] = source[i * 2];
    }
    return target;
  };
  // needed by parse()
  makeArray.BYTES_PER_ELEMENT = 8;
  return makeArray;
}

/**
 * Parses a uint16 (unsigned 16-bit integer) at a specified position in a
 * Uint8Array
 */
function readUint16At(array: Uint8Array, index: number): number {
  return array[index] + (array[index + 1] << 8);
}

/**
 * Parses a string at a specified position in a Uint8Array
 */
function readStringAt(array: Uint8Array, start: number, end: number) {
  return Array.from(array.slice(start, end))
    .map((c) => String.fromCharCode(c))
    .join("");
}

/**
 * Parses a saved numpy array
 */
function parse(array: Uint8Array): OverlayMask {
  const version = readUint16At(array, 6);
  if (version !== 1) {
    throw new Error(`Unsupported version: ${version}`);
  }
  const headerLength = readUint16At(array, 8);
  const bodyIndex = 10 + headerLength;
  const header = JSON.parse(
    readStringAt(array, 10, bodyIndex)
      .replace(/'/g, '"')
      .replace(/\(/g, "[")
      .replace(/\)/g, "]")
      .replace(/True|False/g, (s) => s.toLowerCase())
      .replace(/\s+/g, "")
      .replace(/,}/, "}")
      .replace(/,\]/, "]")
  );

  if (header.fortran_order) {
    throw new Error(`Fortran order arrays are not supported"`);
  }

  const ArrayType = DATA_TYPES[header.descr];

  if (!ArrayType) {
    throw new Error(`Unsupported data type: "${header.descr}"`);
  }
  const rawData = array.slice(bodyIndex);

  const typedData =
    ArrayType === Uint8Array
      ? rawData
      : new ArrayType(
          rawData.buffer,
          rawData.byteOffset,
          rawData.byteLength / ArrayType.BYTES_PER_ELEMENT
        );

  return {
    arrayType: typedData.constructor.name,
    buffer: typedData.buffer,
    channels: header.shape[2] ?? 1,
    shape: [header.shape[0], header.shape[1]],
  };
}

/**
 * Deserializes and parses a base64 encoded numpy array
 */
function deserialize(compressedBase64Array: string): OverlayMask {
  return parse(pako.inflate(Buffer.from(compressedBase64Array, "base64")));
}
