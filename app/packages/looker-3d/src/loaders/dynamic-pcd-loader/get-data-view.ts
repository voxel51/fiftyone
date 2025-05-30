import { PCDFieldType } from "./types";

/**
 * Reads a single field value from DataView.
 *
 * DataView ref: https://developer.mozilla.org/en-US/docs/Web/API/DataView
 */
export function getDataView(
  dv: DataView,
  offset: number,
  type: PCDFieldType,
  size: number,
  littleEndian: boolean
): number {
  switch (type) {
    case "F":
      return size === 8
        ? dv.getFloat64(offset, littleEndian)
        : dv.getFloat32(offset, littleEndian);
    case "I":
      if (size === 1) return dv.getInt8(offset);
      if (size === 2) return dv.getInt16(offset, littleEndian);
      return dv.getInt32(offset, littleEndian);
    case "U":
      if (size === 1) return dv.getUint8(offset);
      if (size === 2) return dv.getUint16(offset, littleEndian);
      return dv.getUint32(offset, littleEndian);
  }
}
