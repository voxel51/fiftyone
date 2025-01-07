/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Buffer } from "buffer";
import pako from "./pako.js";
import type { OverlayMask } from "./types.js";

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

  "|u8": BigUint64Array,
  "<u8": BigUint64Array,
  "|i8": BigInt64Array,
  "<i8": BigInt64Array,

  "<f4": Float32Array,
  "|f4": Float32Array,

  "<f8": Float64Array,
  "|f8": Float64Array,
};

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
export function deserialize(compressedBase64Array: string): OverlayMask {
  return parse(pako.inflate(Buffer.from(compressedBase64Array, "base64")));
}
