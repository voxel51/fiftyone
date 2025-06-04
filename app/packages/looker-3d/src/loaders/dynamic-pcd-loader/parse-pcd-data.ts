import { decompressLZF } from "./decompress-lzf";
import { getDataView } from "./get-data-view";
import { parseHeader } from "./parse-header";
import { PCDAttributes, PCDFieldType, PCDHeader } from "./types";

/**
 * Parses PCD data from ArrayBuffer and returns raw arrays for geometry attributes.
 */
export const parsePCDData = (
  data: ArrayBuffer,
  littleEndian: boolean
): {
  header: PCDHeader;
  position: Float32Array;
  attributes: PCDAttributes;
} => {
  const header = parseHeader(data);
  const {
    fields,
    offset: off,
    type: types,
    size: sizes,
    points,
    rowSize,
  } = header;
  const hasXYZ = "x" in off && "y" in off && "z" in off;

  // precompute indices for x,y,z and other fields
  const ix = fields.indexOf("x");
  const iy = fields.indexOf("y");
  const iz = fields.indexOf("z");
  const rgbIdx = fields.indexOf("rgb");
  const scalarFields: string[] = [];
  for (const f of fields) {
    if (f === "x" || f === "y" || f === "z" || f === "rgb") continue;
    scalarFields.push(f);
  }

  // allocate typed arrays upfront
  // this is better than having a Number[] array that we "push" to
  const position = hasXYZ ? new Float32Array(points * 3) : new Float32Array(0);
  const attributes: PCDAttributes = {};

  for (const f of scalarFields) {
    attributes[f] = new Float32Array(points);
  }

  if (rgbIdx !== -1) {
    // rgb becomes 3 floats per point
    attributes.rgb = new Float32Array(points * 3);
  }

  if (header.data === PCDFieldType.Ascii) {
    const text = new TextDecoder().decode(data).substring(header.headerLen);
    const lines = text.split("\n");
    // point index
    let pi = 0;

    for (let li = 0; li < lines.length; li++) {
      const ln = lines[li].trim();
      if (!ln) continue;
      const parts = ln.split(/\s+/);

      if (hasXYZ) {
        const base = pi * 3;
        // unary + is faster than Number()
        position[base] = +parts[off.x];
        position[base + 1] = +parts[off.y];
        position[base + 2] = +parts[off.z];
      }

      // scalar fields
      for (let si = 0; si < scalarFields.length; si++) {
        const f = scalarFields[si];
        (attributes[f] as Float32Array)[pi] = +parts[off[f]];
      }

      // rgb special case
      if (rgbIdx !== -1) {
        // parse float -> int bits
        const raw = parseFloat(parts[off.rgb]);
        const iv = new Int32Array(new Float32Array([raw]).buffer)[0];
        // extract and normalize
        const r = ((iv >> 16) & 0xff) / 255;
        const g = ((iv >> 8) & 0xff) / 255;
        const b = (iv & 0xff) / 255;
        const rb = attributes.rgb as Float32Array;
        const base = pi * 3;
        rb[base] = r;
        rb[base + 1] = g;
        rb[base + 2] = b;
      }

      pi++;
    }
  } else {
    // setup for both BinaryCompressed and Binary
    let dv: DataView;
    let baseOffsets: number[] | null = null;

    if (header.data === PCDFieldType.BinaryCompressed) {
      const dvHeader = new DataView(data, header.headerLen, 8);
      const compressedSize = dvHeader.getUint32(0, true);
      const decompressedSize = dvHeader.getUint32(4, true);
      const compressed = new Uint8Array(
        data,
        header.headerLen + 8,
        compressedSize
      );
      const decompressed = decompressLZF(compressed, decompressedSize);
      dv = new DataView(decompressed.buffer);

      baseOffsets = fields.map((_, fi) => points * off[fields[fi]]);
    } else {
      dv = new DataView(data, header.headerLen);
    }

    for (let i = 0; i < points; i++) {
      // position
      if (hasXYZ) {
        const base = i * 3;
        if (header.data === PCDFieldType.BinaryCompressed && baseOffsets) {
          position[base] = getDataView(
            dv,
            baseOffsets[ix] + sizes[ix] * i,
            types[ix],
            sizes[ix],
            littleEndian
          );
          position[base + 1] = getDataView(
            dv,
            baseOffsets[iy] + sizes[iy] * i,
            types[iy],
            sizes[iy],
            littleEndian
          );
          position[base + 2] = getDataView(
            dv,
            baseOffsets[iz] + sizes[iz] * i,
            types[iz],
            sizes[iz],
            littleEndian
          );
        } else {
          const row = i * rowSize;
          position[base] = getDataView(
            dv,
            row + off.x,
            types[ix],
            sizes[ix],
            littleEndian
          );
          position[base + 1] = getDataView(
            dv,
            row + off.y,
            types[iy],
            sizes[iy],
            littleEndian
          );
          position[base + 2] = getDataView(
            dv,
            row + off.z,
            types[iz],
            sizes[iz],
            littleEndian
          );
        }
      }

      // scalar fields
      for (let si = 0; si < scalarFields.length; si++) {
        const f = scalarFields[si];
        const idx = fields.indexOf(f);
        if (header.data === PCDFieldType.BinaryCompressed && baseOffsets) {
          (attributes[f] as Float32Array)[i] = getDataView(
            dv,
            baseOffsets[idx] + sizes[idx] * i,
            types[idx],
            sizes[idx],
            littleEndian
          );
        } else {
          const row = i * rowSize;
          (attributes[f] as Float32Array)[i] = getDataView(
            dv,
            row + off[f],
            types[idx],
            sizes[idx],
            littleEndian
          );
        }
      }

      // rgb
      if (rgbIdx !== -1) {
        const rgbArr = attributes.rgb as Float32Array;
        const base = i * 3;
        if (header.data === PCDFieldType.BinaryCompressed && baseOffsets) {
          const byteOffset = baseOffsets[rgbIdx] + sizes[rgbIdx] * i;
          const r = dv.getUint8(byteOffset + 2) / 255;
          const g = dv.getUint8(byteOffset + 1) / 255;
          const b = dv.getUint8(byteOffset) / 255;
          rgbArr[base] = r;
          rgbArr[base + 1] = g;
          rgbArr[base + 2] = b;
        } else {
          const row = i * rowSize;
          const r = dv.getUint8(row + off.rgb + 2) / 255;
          const g = dv.getUint8(row + off.rgb + 1) / 255;
          const b = dv.getUint8(row + off.rgb) / 255;
          rgbArr[base] = r;
          rgbArr[base + 1] = g;
          rgbArr[base + 2] = b;
        }
      }
    }
  }

  return { header, position, attributes };
};
