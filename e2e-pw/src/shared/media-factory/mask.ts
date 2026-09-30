/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import zlib from "zlib";
import type { JSONObject } from "../dataset-factory";

const NPY_MAGIC = Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);

/**
 * A `height x width` numpy array in the form FiftyOne stores one: `np.save`
 * bytes, zlib-compressed, as an extended-JSON binary.
 */
const encodeArray = (
  descr: string,
  width: number,
  height: number,
  data: Buffer,
): JSONObject => {
  const dict = `{'descr': '${descr}', 'fortran_order': False, 'shape': (${height}, ${width}), }`;
  // npy v1.0 pads the header so the data starts on a 64-byte boundary
  const padding = (64 - ((NPY_MAGIC.length + 4 + dict.length + 1) % 64)) % 64;
  const header = Buffer.from(`${dict}${" ".repeat(padding)}\n`, "latin1");
  const headerLength = Buffer.alloc(2);
  headerLength.writeUInt16LE(header.length);
  const npy = Buffer.concat([
    NPY_MAGIC,
    Buffer.from([1, 0]),
    headerLength,
    header,
    data,
  ]);
  return {
    $binary: {
      base64: zlib.deflateSync(npy).toString("base64"),
      subType: "00",
    },
  };
};

/**
 * An all-ones boolean mask of the given size. Attach it as the `mask` of a
 * Detection document.
 */
export const createMask = (width: number, height: number): JSONObject =>
  encodeArray("|b1", width, height, Buffer.alloc(width * height, 1));

/**
 * A uint8 mask with every pixel set to `target`. Attach it as the `mask` of a
 * Segmentation document.
 */
export const createTargetMask = (
  width: number,
  height: number,
  target: number,
): JSONObject =>
  encodeArray("|u1", width, height, Buffer.alloc(width * height, target));

/**
 * A float32 map with every pixel set to `value`. Attach it as the `map` of a
 * Heatmap document.
 */
export const createValueMap = (
  width: number,
  height: number,
  value: number,
): JSONObject => {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.writeFloatLE(value, i * 4);
  }
  return encodeArray("<f4", width, height, data);
};
