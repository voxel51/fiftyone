import {
  BufferGeometry,
  Color,
  FileLoader,
  Float32BufferAttribute,
  Int32BufferAttribute,
  Loader,
  LoadingManager,
  Points,
  PointsMaterial,
  SRGBColorSpace,
} from "three";
import { ErrorCallback, ProgressCallback } from "./types";
import { decompressLZF, parseHeader } from "./utils";

/**
 * DynamicPCDLoader parses Point Cloud Data (PCD) files (ASCII, binary, compressed)
 * and returns a THREE.Points instance.
 *
 * This is based on the original THREE.JS PCDLoader, but with the following changes:
 * - It's written in Typescript.
 * - It supports dynamic schema parsing (original PCDLoader only supports static schema of rgb, intensity, normal, and labels)
 */
export class DynamicPCDLoader extends Loader {
  public littleEndian: boolean;

  constructor(manager?: LoadingManager, littleEndian: boolean = true) {
    super(manager);
    this.littleEndian = littleEndian;
  }

  /**
   * Asynchronously load a PCD file.
   */
  public load(
    url: string,
    onLoad: (points: Points) => void,
    onProgress?: ProgressCallback,
    onError?: ErrorCallback
  ): void {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(
      url,
      (data: ArrayBuffer) => {
        try {
          const points = this.parse(data);
          onLoad(points);
        } catch (err) {
          if (onError) onError(err);
          else console.error(err);
          this.manager.itemError(url);
        }
      },
      onProgress,
      onError
    );
  }

  /**
   * Promise-based loader.
   */
  public loadAsync(
    url: string,
    onProgress?: ProgressCallback
  ): Promise<Points> {
    return new Promise((resolve, reject) => {
      this.load(url, resolve, onProgress, reject);
    });
  }

  /**
   * Read a single field value from DataView.
   */
  private _getDataView(
    dv: DataView,
    offset: number,
    type: "F" | "I" | "U",
    size: number
  ): number {
    switch (type) {
      case "F":
        return size === 8
          ? dv.getFloat64(offset, this.littleEndian)
          : dv.getFloat32(offset, this.littleEndian);
      case "I":
        if (size === 1) return dv.getInt8(offset);
        if (size === 2) return dv.getInt16(offset, this.littleEndian);
        return dv.getInt32(offset, this.littleEndian);
      case "U":
        if (size === 1) return dv.getUint8(offset);
        if (size === 2) return dv.getUint16(offset, this.littleEndian);
        return dv.getUint32(offset, this.littleEndian);
    }
  }

  /**
   * Parse ArrayBuffer into THREE.Points.
   */
  public parse(data: ArrayBuffer): Points {
    const header = parseHeader(data);
    const position: number[] = [];
    const normal: number[] = [];
    const color: number[] = [];
    const intensity: number[] = [];
    const label: number[] = [];
    const tmpColor = new Color();

    if (header.data === "ascii") {
      const text = new TextDecoder().decode(data).substr(header.headerLen);
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
          tmpColor.setRGB(
            ((iv >> 16) & 0xff) / 255,
            ((iv >> 8) & 0xff) / 255,
            (iv & 0xff) / 255,
            SRGBColorSpace
          );
          color.push(tmpColor.r, tmpColor.g, tmpColor.b);
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
    } else if (header.data === "binary_compressed") {
      const sizes = new Uint32Array(
        data.slice(header.headerLen, header.headerLen + 8)
      );
      const compressed = new Uint8Array(data, header.headerLen + 8, sizes[0]);
      const decompressed = decompressLZF(compressed, sizes[1]);

      // note: using
      const dv = new DataView(decompressed.buffer);
      for (let i = 0; i < header.points; i++) {
        const base = i * header.rowSize;
        if ("x" in header.offset) {
          const ix = header.fields.indexOf("x");
          position.push(
            this._getDataView(
              dv,
              header.points * header.offset.x + header.size[ix] * i,
              header.type[ix],
              header.size[ix]
            ),
            this._getDataView(
              dv,
              header.points * header.offset.y +
                header.size[header.fields.indexOf("y")] * i,
              header.type[header.fields.indexOf("y")],
              header.size[header.fields.indexOf("y")]
            ),
            this._getDataView(
              dv,
              header.points * header.offset.z +
                header.size[header.fields.indexOf("z")] * i,
              header.type[header.fields.indexOf("z")],
              header.size[header.fields.indexOf("z")]
            )
          );
        }
        if ("rgb" in header.offset) {
          const idx = header.fields.indexOf("rgb");
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
        if ("normal_x" in header.offset) {
          const ix = header.fields.indexOf("normal_x");
          normal.push(
            this._getDataView(
              dv,
              header.points * header.offset.normal_x + header.size[ix] * i,
              header.type[ix],
              header.size[ix]
            ),
            this._getDataView(
              dv,
              header.points * header.offset.normal_y +
                header.size[header.fields.indexOf("normal_y")] * i,
              header.type[header.fields.indexOf("normal_y")],
              header.size[header.fields.indexOf("normal_y")]
            ),
            this._getDataView(
              dv,
              header.points * header.offset.normal_z +
                header.size[header.fields.indexOf("normal_z")] * i,
              header.type[header.fields.indexOf("normal_z")],
              header.size[header.fields.indexOf("normal_z")]
            )
          );
        }
        if ("intensity" in header.offset) {
          const idx = header.fields.indexOf("intensity");
          intensity.push(
            this._getDataView(
              dv,
              header.points * header.offset.intensity + header.size[idx] * i,
              header.type[idx],
              header.size[idx]
            )
          );
        }
        if ("label" in header.offset) {
          const idx = header.fields.indexOf("label");
          label.push(
            dv.getInt32(
              header.points * header.offset.label + header.size[idx] * i,
              this.littleEndian
            )
          );
        }
      }
    } else if (header.data === "binary") {
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
            this._getDataView(dv, row + offsetMap.x, types[ix], sizes[ix]),
            this._getDataView(dv, row + offsetMap.y, types[iy], sizes[iy]),
            this._getDataView(dv, row + offsetMap.z, types[iz], sizes[iz])
          );
        }

        if ("rgb" in offsetMap) {
          color.push(
            dv.getUint8(row + offsetMap.rgb + 2) / 255,
            dv.getUint8(row + offsetMap.rgb + 1) / 255,
            dv.getUint8(row + offsetMap.rgb + 0) / 255
          );
        }

        if ("normal_x" in offsetMap) {
          const ix = header.fields.indexOf("normal_x");
          normal.push(
            this._getDataView(
              dv,
              row + offsetMap.normal_x,
              types[ix],
              sizes[ix]
            ),
            this._getDataView(
              dv,
              row + offsetMap.normal_y,
              types[iy],
              sizes[iy]
            ),
            this._getDataView(
              dv,
              row + offsetMap.normal_z,
              types[iz],
              sizes[iz]
            )
          );
        }

        if ("intensity" in offsetMap) {
          const idx = fields.indexOf("intensity");
          intensity.push(
            this._getDataView(
              dv,
              row + offsetMap.intensity,
              types[idx],
              sizes[idx]
            )
          );
        }

        if ("label" in offsetMap) {
          label.push(dv.getInt32(row + offsetMap.label, this.littleEndian));
        }
      }
    }

    const geometry = new BufferGeometry();
    if (position.length)
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(position, 3)
      );
    if (normal.length)
      geometry.setAttribute("normal", new Float32BufferAttribute(normal, 3));
    if (color.length)
      geometry.setAttribute("color", new Float32BufferAttribute(color, 3));
    if (intensity.length)
      geometry.setAttribute(
        "intensity",
        new Float32BufferAttribute(intensity, 1)
      );
    if (label.length)
      geometry.setAttribute("label", new Int32BufferAttribute(label, 1));
    geometry.computeBoundingSphere();

    // Build material & points
    const material = new PointsMaterial({
      size: 0.005,
      vertexColors: color.length > 0,
    });
    return new Points(geometry, material);
  }
}
