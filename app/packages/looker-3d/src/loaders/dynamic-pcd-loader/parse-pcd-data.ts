import { Color, SRGBColorSpace } from "three";
import { PCDFieldType, PCDHeader } from "./types";
import { parseHeader } from "./parse-header";
import { decompressLZF } from "./decompress-lzf";
import { getDataView } from "./get-data-view";

/**
 * Parses PCD data from ArrayBuffer and returns raw arrays for geometry attributes.
 * This is the core logic from DynamicPCDLoader.parse, without any Three.js dependencies.
 */
export function parsePCDData(
  data: ArrayBuffer,
  littleEndian: boolean
): {
  header: PCDHeader;
  position: number[];
  normal: number[];
  color: number[];
  intensity: number[];
  label: number[];
} {
  const header = parseHeader(data);
  const position: number[] = [];
  const normal: number[] = [];
  const color: number[] = [];
  const intensity: number[] = [];
  const label: number[] = [];
  const tmpColor = new Color();

  if (header.data === PCDFieldType.Ascii) {
    const text = new TextDecoder().decode(data).substring(header.headerLen);
    const lines = text.split("\n");
    for (const ln of lines) {
      if (!ln.trim()) continue;
      const parts = ln.trim().split(/\s+/);
      if ("x" in header.offset) {
        position.push(
          +parts[header.offset.x],
          +parts[header.offset.y],
          +parts[header.offset.z]
        );
      }
      if ("rgb" in header.offset) {
        const raw = parseFloat(parts[header.offset.rgb]);
        const view = new Float32Array([raw]);
        const iv = new Int32Array(view.buffer)[0];
        if (tmpColor) {
          tmpColor.setRGB(
            ((iv >> 16) & 0xff) / 255,
            ((iv >> 8) & 0xff) / 255,
            (iv & 0xff) / 255,
            SRGBColorSpace
          );
          color.push(tmpColor.r, tmpColor.g, tmpColor.b);
        }
      }
      if ("normal_x" in header.offset) {
        normal.push(
          +parts[header.offset.normal_x],
          +parts[header.offset.normal_y],
          +parts[header.offset.normal_z]
        );
      }
      if ("intensity" in header.offset) {
        intensity.push(+parts[header.offset.intensity]);
      }
      if ("label" in header.offset) {
        label.push(+parts[header.offset.label]);
      }
    }
  } else if (header.data === PCDFieldType.BinaryCompressed) {
    const sizes = new Uint32Array(
      data.slice(header.headerLen, header.headerLen + 8)
    );
    const compressed = new Uint8Array(data, header.headerLen + 8, sizes[0]);
    const decompressed = decompressLZF(compressed, sizes[1]);
    const dv = new DataView(decompressed.buffer);
    for (let i = 0; i < header.points; i++) {
      const base = i * header.rowSize;
      if ("x" in header.offset) {
        const ix = header.fields.indexOf("x");
        position.push(
          getDataView(
            dv,
            header.points * header.offset.x + header.size[ix] * i,
            header.type[ix],
            header.size[ix],
            littleEndian
          ),
          getDataView(
            dv,
            header.points * header.offset.y +
              header.size[header.fields.indexOf("y")] * i,
            header.type[header.fields.indexOf("y")],
            header.size[header.fields.indexOf("y")],
            littleEndian
          ),
          getDataView(
            dv,
            header.points * header.offset.z +
              header.size[header.fields.indexOf("z")] * i,
            header.type[header.fields.indexOf("z")],
            header.size[header.fields.indexOf("z")],
            littleEndian
          )
        );
      }
      if ("rgb" in header.offset) {
        const idx = header.fields.indexOf("rgb");
        if (tmpColor && SRGBColorSpace) {
          const r =
            dv.getUint8(
              header.points * header.offset.rgb + header.size[idx] * i + 2
            ) / 255;
          const g =
            dv.getUint8(
              header.points * header.offset.rgb + header.size[idx] * i + 1
            ) / 255;
          const b =
            dv.getUint8(
              header.points * header.offset.rgb + header.size[idx] * i + 0
            ) / 255;
          tmpColor.setRGB(r, g, b, SRGBColorSpace);
          color.push(tmpColor.r, tmpColor.g, tmpColor.b);
        }
      }
      if ("normal_x" in header.offset) {
        const ix = header.fields.indexOf("normal_x");
        normal.push(
          getDataView(
            dv,
            header.points * header.offset.normal_x + header.size[ix] * i,
            header.type[ix],
            header.size[ix],
            littleEndian
          ),
          getDataView(
            dv,
            header.points * header.offset.normal_y +
              header.size[header.fields.indexOf("normal_y")] * i,
            header.type[header.fields.indexOf("normal_y")],
            header.size[header.fields.indexOf("normal_y")],
            littleEndian
          ),
          getDataView(
            dv,
            header.points * header.offset.normal_z +
              header.size[header.fields.indexOf("normal_z")] * i,
            header.type[header.fields.indexOf("normal_z")],
            header.size[header.fields.indexOf("normal_z")],
            littleEndian
          )
        );
      }
      if ("intensity" in header.offset) {
        const idx = header.fields.indexOf("intensity");
        intensity.push(
          getDataView(
            dv,
            header.points * header.offset.intensity + header.size[idx] * i,
            header.type[idx],
            header.size[idx],
            littleEndian
          )
        );
      }
      if ("label" in header.offset) {
        label.push(
          dv.getInt32(
            header.points * header.offset.label +
              header.size[header.fields.indexOf("label")] * i,
            littleEndian
          )
        );
      }
    }
  } else if (header.data === PCDFieldType.Binary) {
    const dv = new DataView(data, header.headerLen);
    const offsetMap = header.offset;
    const fields = header.fields;
    const types = header.type;
    const sizes = header.size;
    const ix = fields.indexOf("x");
    const iy = fields.indexOf("y");
    const iz = fields.indexOf("z");
    for (let i = 0; i < header.points; i++) {
      const row = i * header.rowSize;
      if ("x" in offsetMap) {
        position.push(
          getDataView(
            dv,
            row + offsetMap.x,
            types[ix],
            sizes[ix],
            littleEndian
          ),
          getDataView(
            dv,
            row + offsetMap.y,
            types[iy],
            sizes[iy],
            littleEndian
          ),
          getDataView(dv, row + offsetMap.z, types[iz], sizes[iz], littleEndian)
        );
      }
      if ("rgb" in offsetMap) {
        if (tmpColor && SRGBColorSpace) {
          color.push(
            dv.getUint8(row + offsetMap.rgb + 2) / 255,
            dv.getUint8(row + offsetMap.rgb + 1) / 255,
            dv.getUint8(row + offsetMap.rgb + 0) / 255
          );
        }
      }
      if ("normal_x" in offsetMap) {
        const ix = header.fields.indexOf("normal_x");
        normal.push(
          getDataView(
            dv,
            row + offsetMap.normal_x,
            types[ix],
            sizes[ix],
            littleEndian
          ),
          getDataView(
            dv,
            row + offsetMap.normal_y,
            types[iy],
            sizes[iy],
            littleEndian
          ),
          getDataView(
            dv,
            row + offsetMap.normal_z,
            types[iz],
            sizes[iz],
            littleEndian
          )
        );
      }
      if ("intensity" in offsetMap) {
        const idx = fields.indexOf("intensity");
        intensity.push(
          getDataView(
            dv,
            row + offsetMap.intensity,
            types[idx],
            sizes[idx],
            littleEndian
          )
        );
      }
      if ("label" in offsetMap) {
        label.push(dv.getInt32(row + offsetMap.label, littleEndian));
      }
    }
  }
  return { header, position, normal, color, intensity, label };
}
