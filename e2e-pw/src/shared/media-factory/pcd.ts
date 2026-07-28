/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { spawnSync } from "child_process";
import { Duration, getPythonCommand } from "src/oss/utils";
import { dedentPythonCode } from "src/oss/utils/dedent";

/**
 * Generates a PCD (Point Cloud Data) file at the specified path using pypcd4,
 * with a configurable number of points arranged in one of two 3D shapes.
 *
 * The Python code is executed synchronously via a shell subprocess with a
 * 5-second timeout. Stderr output from the subprocess is forwarded to
 * `console.error`, and an error is thrown if the subprocess exits nonzero.
 *
 * **Shape layouts:**
 * - `"diagonal"` — Points are arranged along the main diagonal of 3D space,
 *   i.e. `[0,0,0], [1,1,1], ..., [n-1, n-1, n-1]`. Produces exactly
 *   `numPoints` points.
 * - `"cube"` — Points fill a uniform cubic grid. The cube side length is
 *   `floor(numPoints^(1/3))`, so the actual number of points written will be
 *   `floor(numPoints^(1/3))^3`, which may be less than `numPoints`.
 *
 * @param options - Configuration for PCD generation.
 * @param options.outputPath - The file path where the `.pcd` file will be written
 *   (e.g. `/tmp/dataset/scene.pcd`). The directory must already exist.
 * @param options.numPoints - The number of points to generate.
 *   For `"cube"` shape, the actual count is `floor(numPoints^(1/3))^3`.
 * @param options.shape - The spatial arrangement of points. Either `"diagonal"`
 *   or `"cube"`. See shape layouts above.
 * @param options.imputeNaN - Optional configuration for injecting `NaN` values
 *   into specific point coordinates, useful for testing NaN-handling behavior.
 * @param options.imputeNaN.indices - An array of `[pointIndex, coordinateIndex]`
 *   pairs. `pointIndex` selects the point in the generated array and
 *   `coordinateIndex` selects the coordinate (`0`=x, `1`=y, `2`=z) to
 *   set to `NaN`.
 *
 * @example
 * // Diagonal point cloud with 10 points
 * createPcd({
 *   outputPath: "/tmp/scene.pcd",
 *   numPoints: 10,
 *   shape: "diagonal",
 * });
 *
 * @example
 * // Cubic grid with NaN injected at point 0's x-coordinate and point 1's z-coordinate
 * createPcd({
 *   outputPath: "/tmp/scene.pcd",
 *   numPoints: 27,
 *   shape: "cube",
 *   imputeNaN: {
 *     indices: [[0, 0], [1, 2]],
 *   },
 * });
 */
export const createPcd = (options: {
  /** The file path where the `.pcd` file will be written. */
  outputPath: string;
  /**
   * The number of points to generate.
   * For `"cube"` shape, actual count will be `floor(numPoints^(1/3))^3`.
   */
  numPoints: number;
  /**
   * The spatial arrangement of the generated points.
   * - `"diagonal"` — points along the 3D main diagonal: `[i, i, i]`
   * - `"cube"` — points filling a uniform cubic grid
   */
  shape: "diagonal" | "cube";
  /**
   * Optional NaN imputation config for injecting `NaN` into specific
   * point coordinates. Useful for testing NaN-handling behavior.
   */
  imputeNaN?: {
    /**
     * Array of `[pointIndex, coordinateIndex]` pairs identifying which
     * coordinates to set to `NaN`. `coordinateIndex` maps to: `0`=x, `1`=y, `2`=z.
     */
    indices: Array<number[]>;
  };
}) => {
  const { outputPath, numPoints, imputeNaN } = options;

  const startTime = performance.now();
  console.log(`Creating pcd with options: ${JSON.stringify(options)}`);
  const pythonCode = `
  import numpy as np
  from pypcd4 import Encoding, PointCloud

  if "${options.shape}" == "diagonal":
    points = [[i, i, i] for i in range(${numPoints})]
  elif "${options.shape}" == "cube":
    loop_stop = int(${numPoints} ** (1/3))
    points = [[i, j, k] for i in range(loop_stop) for j in range(loop_stop) for k in range(loop_stop)]

  if ${imputeNaN?.indices ? "True" : "False"}:
    for index in ${JSON.stringify(imputeNaN?.indices)}:
      points[index[0]][index[1]] = float("nan")

  pc = PointCloud.from_xyz_points(np.array(points, dtype=np.float32))
  pc.save("${outputPath}", Encoding.ASCII)
  `;

  const command = getPythonCommand([
    "-c",
    `'''${dedentPythonCode(pythonCode)}'''`,
  ]);
  const proc = spawnSync(command, {
    shell: true,
    timeout: Duration.Seconds(5),
  });
  if (proc.stderr) {
    console.error(proc.stderr.toString());
  }
  if (proc.status !== 0) {
    throw new Error(
      `Pcd generation failed with exit code ${proc.status}: ${proc.stderr}`,
    );
  }

  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(`Pcd generation completed in ${timeTaken} milliseconds`);
};
