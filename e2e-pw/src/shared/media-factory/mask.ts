/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import zlib from "zlib";
import type { JSONObject } from "../dataset-factory";

const NPY_MAGIC = Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);

/**
 * Creates an all-ones boolean mask of the given size in the form FiftyOne
 * stores a numpy `mask`: `np.save` bytes, zlib-compressed, as an extended-JSON
 * binary. Attach it as the `mask` of a Detection document.
 */
export const createMask = (width: number, height: number): JSONObject => {
  const dict = `{'descr': '|b1', 'fortran_order': False, 'shape': (${height}, ${width}), }`;
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
    Buffer.alloc(width * height, 1),
  ]);
  return {
    $binary: {
      base64: zlib.deflateSync(npy).toString("base64"),
      subType: "00",
    },
  };
};
