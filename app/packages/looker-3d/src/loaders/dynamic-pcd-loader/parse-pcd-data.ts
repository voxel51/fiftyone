import { Color, SRGBColorSpace } from "three";
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
  position: number[];
  attributes: PCDAttributes;
} => {
  const header = parseHeader(data);
  const position: number[] = [];
  const attributes: PCDAttributes = {};
  const tmpColor = new Color();

  // init arrays for all fields except x, y, z
  for (const field of header.fields) {
    if (field !== "x" && field !== "y" && field !== "z") {
      attributes[field] = [];
    }
  }

  if (header.data === PCDFieldType.Ascii) {
    const text = new TextDecoder().decode(data).substring(header.headerLen);
    const lines = text.split("\n");

    for (const ln of lines) {
      if (!ln.trim()) continue;

      const parts = ln.trim().split(/\s+/);

      if ("x" in header.offset) {
        position.push(
          Number(parts[header.offset.x]),
          Number(parts[header.offset.y]),
          Number(parts[header.offset.z])
        );
      }

      for (const field of header.fields) {
        if (field === "x" || field === "y" || field === "z") continue;

        if (field === "rgb") {
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
            attributes.rgb.push(tmpColor.r, tmpColor.g, tmpColor.b);
          }
        } else {
          attributes[field].push(Number(parts[header.offset[field]]));
        }
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

      for (const field of header.fields) {
        if (field === "x" || field === "y" || field === "z") continue;
        const idx = header.fields.indexOf(field);

        if (field === "rgb") {
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
            attributes.rgb.push(tmpColor.r, tmpColor.g, tmpColor.b);
          }
        } else {
          attributes[field].push(
            getDataView(
              dv,
              header.points * header.offset[field] + header.size[idx] * i,
              header.type[idx],
              header.size[idx],
              littleEndian
            )
          );
        }
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

      for (const field of fields) {
        if (field === "x" || field === "y" || field === "z") continue;
        const idx = fields.indexOf(field);
        if (field === "rgb") {
          if (tmpColor) {
            attributes.rgb.push(
              dv.getUint8(row + offsetMap.rgb + 2) / 255,
              dv.getUint8(row + offsetMap.rgb + 1) / 255,
              dv.getUint8(row + offsetMap.rgb + 0) / 255
            );
          }
        } else {
          attributes[field].push(
            getDataView(
              dv,
              row + offsetMap[field],
              types[idx],
              sizes[idx],
              littleEndian
            )
          );
        }
      }
    }
  }

  return { header, position, attributes };
};
