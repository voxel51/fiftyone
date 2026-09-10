/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { spawnSync } from "child_process";
import { Duration, getPythonCommand } from "src/oss/utils";
import { dedentPythonCode } from "src/oss/utils/dedent";
import type { MediaOptions } from "./types";
import { generateOnce } from "./write";

/**
 * What to write into a PCD point cloud.
 */
export interface PcdSpec {
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
}

export type PcdOptions = MediaOptions & PcdSpec;

/**
 * Generates a PCD file at `outputPath` with `numPoints` points on the 3D
 * diagonal (`[i, i, i]`) or filling a cubic grid of side
 * `floor(numPoints^(1/3))`, via a pypcd4 subprocess with a 5-second timeout.
 * Stderr is forwarded and a nonzero exit throws.
 *
 * @example
 * createPcd({
 *   outputPath: "/tmp/scene.pcd",
 *   numPoints: 27,
 *   shape: "cube",
 *   imputeNaN: { indices: [[0, 0], [1, 2]] },
 * });
 */
export const createPcd = (options: PcdOptions): void => {
  const { outputPath, numPoints, imputeNaN } = options;

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

  generateOnce("Pcd", options, () => {
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
  });
};
