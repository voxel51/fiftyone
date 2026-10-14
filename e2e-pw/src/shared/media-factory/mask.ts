/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import fs from "fs";
import zlib from "zlib";
import type { JSONObject } from "../dataset-factory";
import type { MediaOptions } from "./types";
import { generateOnce } from "./write";

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

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

const crc32 = (data: Buffer) => {
  let c = 0xffffffff;
  for (const byte of data) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** What to write into an 8-bit grayscale mask PNG. */
export interface MaskImageSpec {
  width: number;
  height: number;
  /** The value of every pixel. */
  value: number;
}

/**
 * Writes an 8-bit single-channel PNG with every pixel set to `value`, the
 * on-disk form of a label's `mask_path`.
 *
 * @example
 * createMaskImage({ outputPath: "/tmp/mask.png", width: 15, height: 15, value: 1 });
 */
export const createMaskImage = (
  options: MediaOptions & MaskImageSpec,
): void => {
  const { width, height, value } = options;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  // bit depth 8, color type 0 (grayscale), default compression/filter/interlace
  header.set([8, 0, 0, 0, 0], 8);
  // each scanline starts with filter type 0
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, value)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));

  generateOnce("MaskImage", options, () => {
    fs.writeFileSync(
      options.outputPath,
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", header),
        pngChunk("IDAT", zlib.deflateSync(pixels)),
        pngChunk("IEND", Buffer.alloc(0)),
      ]),
    );
  });
};
