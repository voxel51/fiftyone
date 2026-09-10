/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import zlib from "zlib";
import type { JSONObject, JSONValue } from "./dataset-factory";

const NPY_MAGIC = Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);

/**
 * An all-ones boolean mask of the given size in the form FiftyOne stores a
 * numpy `mask`: `np.save` bytes, zlib-compressed, as an extended-JSON binary.
 */
export const serializeMask = (width: number, height: number): JSONObject => {
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

/**
 * Non-zero element count and coverage of a stored numpy mask, as returned in a
 * raw sample document (`{ $binary: { base64 } }` or the legacy `{ $binary }`
 * string form).
 */
export const deserializeMask = (
  value: JSONValue,
): { pixels: number; coverage: number } => {
  const binary = (value as { $binary: string | { base64: string } }).$binary;
  const npy = zlib.inflateSync(
    Buffer.from(typeof binary === "string" ? binary : binary.base64, "base64"),
  );
  const v1 = npy[6] === 1;
  const headerStart = v1 ? 10 : 12;
  const dataStart =
    headerStart + (v1 ? npy.readUInt16LE(8) : npy.readUInt32LE(8));
  const header = npy.toString("latin1", headerStart, dataStart);
  const itemSize = Number(
    /'descr':\s*'[<>|=]?[a-zA-Z](\d+)'/.exec(header)?.[1] ?? 1,
  );
  const data = npy.subarray(dataStart);
  const count = data.length / itemSize;
  let pixels = 0;
  for (let offset = 0; offset < data.length; offset += itemSize) {
    if (data.subarray(offset, offset + itemSize).some((byte) => byte !== 0)) {
      pixels++;
    }
  }
  return { pixels, coverage: count ? pixels / count : 0 };
};
