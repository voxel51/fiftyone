import {
  FileLoader,
  Loader,
  LoadingManager,
  Points,
  PointsMaterial,
} from "three";
import { createBufferGeometry } from "./create-buffer-geometry";
import { parsePCDData } from "./parse-pcd-data";
import { ErrorCallback, ProgressCallback } from "./types";

/**
 * DynamicPCDLoader parses Point Cloud Data (PCD) files (ASCII, binary, compressed)
 * and returns a THREE.Points instance.
 *
 * Based on https://github.com/mrdoob/three.js/blob/master/examples/jsm/loaders/PCDLoader.js
 */
export class DynamicPCDLoader extends Loader {
  public littleEndian: boolean;

  constructor(manager?: LoadingManager, littleEndian: boolean = true) {
    super(manager);
    this.littleEndian = littleEndian;
  }

  /**
   * Asynchronously load a PCD file.
   *
   * @param url - The URL of the PCD file
   * @param onLoad - The callback function to call when the file is loaded
   * @param onProgress - The callback function to call during loading progress
   * @param onError - The callback function to call when an error occurs
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
        this.parse(data)
          .then(onLoad)
          .catch((err) => {
            if (onError) onError(err);
            else console.error(err);
            this.manager.itemError(url);
          });
      },
      onProgress,
      onError
    );
  }

  /**
   * Promise-based loader.
   *
   * @param url - The URL of the PCD file
   * @param onProgress - The callback function to call when the file is loaded
   * @returns A Promise that resolves to a THREE.Points instance
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
   *
   * @param data - The ArrayBuffer to parse
   * @returns A Promise that resolves to a THREE.Points instance
   */
  public async parse(data: ArrayBuffer): Promise<Points> {
    const { header, position, attributes } = parsePCDData(
      data,
      this.littleEndian
    );

    const geometry = createBufferGeometry(header, position, attributes);

    // reasonable default material (will most likely be overridden by the user)
    const material = new PointsMaterial({
      size: 0.005,
      vertexColors: !!geometry.getAttribute("color"),
    });
    return new Points(geometry, material);
  }
}
