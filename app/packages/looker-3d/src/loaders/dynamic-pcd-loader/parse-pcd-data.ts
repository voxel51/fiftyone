import { decompressLZF } from "./decompress-lzf";
import { parseHeader } from "./parse-header";
import { PCDAttributes, PCDFieldType, PCDHeader } from "./types";

const sanitizeNaNToZero = (v: number): number => {
  return isNaN(v) ? 0 : v;
};

// helper to read raw values from DataView
const getRawValue = (
  dv: DataView,
  byteOffset: number,
  type: PCDFieldType,
  size: number,
  littleEndian: boolean
): number => {
  switch (type) {
    case "F":
      return size === 8
        ? dv.getFloat64(byteOffset, littleEndian)
        : dv.getFloat32(byteOffset, littleEndian);
    case "I":
      if (size === 1) return dv.getInt8(byteOffset);
      if (size === 2) return dv.getInt16(byteOffset, littleEndian);
      return dv.getInt32(byteOffset, littleEndian);
    case "U":
      if (size === 1) return dv.getUint8(byteOffset);
      if (size === 2) return dv.getUint16(byteOffset, littleEndian);
      return dv.getUint32(byteOffset, littleEndian);
    default:
      throw new Error(`Unsupported field type: ${type}`);
  }
};

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
  let position = hasXYZ ? new Float32Array(points * 3) : new Float32Array(0);
  const attributes: PCDAttributes = {};

  for (const f of scalarFields) {
    attributes[f] = new Float32Array(points);
  }

  if (rgbIdx !== -1) {
    // rgb becomes 3 floats per point
    attributes.rgb = new Float32Array(points * 3);
  }

  // track valid points (non-NaN positions)
  let validPointCount = 0;

  if (header.data === PCDFieldType.Ascii) {
    const text = new TextDecoder().decode(data).substring(header.headerLen);
    const lines = text.split("\n");

    for (let li = 0; li < lines.length; li++) {
      const ln = lines[li].trim();
      if (!ln) continue;
      const parts = ln.split(/\s+/);

      if (hasXYZ) {
        const x = +parts[off.x];
        const y = +parts[off.y];
        const z = +parts[off.z];

        // Skip points with NaN positions
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
          continue;
        }

        const base = validPointCount * 3;
        position[base] = x;
        position[base + 1] = y;
        position[base + 2] = z;
      }

      // scalar fields
      for (let si = 0; si < scalarFields.length; si++) {
        const f = scalarFields[si];
        const value = +parts[off[f]];
        (attributes[f] as Float32Array)[validPointCount] =
          sanitizeNaNToZero(value);
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
        const base = validPointCount * 3;
        rb[base] = r;
        rb[base + 1] = g;
        rb[base + 2] = b;
      }

      validPointCount++;
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

    // precompute scalar field indices and local array refs
    const scalarFieldIndices = scalarFields.map((f) => fields.indexOf(f));
    const scalarArrays = scalarFields.map((f) => attributes[f] as Float32Array);
    const rgbArray = rgbIdx !== -1 ? (attributes.rgb as Float32Array) : null;

    if (header.data === PCDFieldType.BinaryCompressed && baseOffsets) {
      for (let i = 0; i < points; i++) {
        // position
        if (hasXYZ) {
          const x = dv.getFloat32(
            baseOffsets[ix] + sizes[ix] * i,
            littleEndian
          );
          const y = dv.getFloat32(
            baseOffsets[iy] + sizes[iy] * i,
            littleEndian
          );
          const z = dv.getFloat32(
            baseOffsets[iz] + sizes[iz] * i,
            littleEndian
          );
          if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
          const pbase = validPointCount * 3;
          position[pbase] = x;
          position[pbase + 1] = y;
          position[pbase + 2] = z;
        }

        // scalar fields
        for (let si = 0; si < scalarFieldIndices.length; si++) {
          const idx = scalarFieldIndices[si];
          const raw = getRawValue(
            dv,
            baseOffsets[idx] + sizes[idx] * i,
            types[idx],
            sizes[idx],
            littleEndian
          );
          scalarArrays[si][validPointCount] = sanitizeNaNToZero(raw);
        }

        // rgb
        if (rgbArray) {
          const baseOff = baseOffsets[rgbIdx] + sizes[rgbIdx] * i;
          const pbase = validPointCount * 3;
          rgbArray[pbase] = dv.getUint8(baseOff + 2) / 255;
          rgbArray[pbase + 1] = dv.getUint8(baseOff + 1) / 255;
          rgbArray[pbase + 2] = dv.getUint8(baseOff) / 255;
        }

        validPointCount++;
      }
    } else {
      for (let i = 0; i < points; i++) {
        const rowBase = i * rowSize;
        // position
        if (hasXYZ) {
          const x = dv.getFloat32(rowBase + off.x, littleEndian);
          const y = dv.getFloat32(rowBase + off.y, littleEndian);
          const z = dv.getFloat32(rowBase + off.z, littleEndian);
          if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
          const pbase = validPointCount * 3;
          position[pbase] = x;
          position[pbase + 1] = y;
          position[pbase + 2] = z;
        }

        // scalar fields
        for (let si = 0; si < scalarFieldIndices.length; si++) {
          const idx = scalarFieldIndices[si];
          const raw = getRawValue(
            dv,
            rowBase + off[fields[idx]],
            types[idx],
            sizes[idx],
            littleEndian
          );
          scalarArrays[si][validPointCount] = sanitizeNaNToZero(raw);
        }

        // rgb
        if (rgbArray) {
          const pbase = validPointCount * 3;
          rgbArray[pbase] = dv.getUint8(rowBase + off.rgb + 2) / 255;
          rgbArray[pbase + 1] = dv.getUint8(rowBase + off.rgb + 1) / 255;
          rgbArray[pbase + 2] = dv.getUint8(rowBase + off.rgb) / 255;
        }

        validPointCount++;
      }
    }
  }

  // trim arrays to actual size
  if (validPointCount < points) {
    position = position.slice(0, validPointCount * 3);
    const allAttribsKeys = Object.keys(attributes);
    for (const f of allAttribsKeys) {
      attributes[f] = (attributes[f] as Float32Array).slice(
        0,
        f === "rgb" ? validPointCount * 3 : validPointCount
      );
    }
  }

  return { header, position, attributes };
};
