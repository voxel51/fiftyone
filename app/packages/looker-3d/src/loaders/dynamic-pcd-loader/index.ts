import {
  BufferGeometry,
  FileLoader,
  Float32BufferAttribute,
  Int32BufferAttribute,
  Loader,
  LoadingManager,
  Points,
  PointsMaterial,
} from "three";
import { ErrorCallback, ProgressCallback } from "./types";
import { parsePCDData } from "./parse-pcd-data";

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
   * Parse ArrayBuffer into THREE.Points.
   */
  public parse(data: ArrayBuffer): Points {
    const { position, normal, color, intensity, label } = parsePCDData(
      data,
      this.littleEndian
    );
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

    // reasonable default material (will most likely be overridden by the user)
    const material = new PointsMaterial({
      size: 0.005,
      vertexColors: color.length > 0,
    });
    return new Points(geometry, material);
  }
}
