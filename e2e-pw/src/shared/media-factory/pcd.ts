import { spawnSync } from "child_process";
import { Duration, getPythonCommand } from "src/oss/utils";
import { dedentPythonCode } from "src/oss/utils/dedent";

type ChaosOptions = {
  imputeNaN?: {
    indices: Array<number[]>;
  };
};

/**
 * This function creates a new pcd file with the specified number of points.
 * The points are arranged in a diagonal line in 3D space.
 */
export const createPcd = (options: {
  outputPath: string;
  numPoints: number;
  shape: "diagonal" | "cube";
  chaosOptions?: ChaosOptions;
}) => {
  const { outputPath, numPoints, chaosOptions } = options;

  const startTime = performance.now();
  console.log(`Creating blank pcd with options: ${JSON.stringify(options)}`);
  const pythonCode = `
  import open3d as o3d
  pcd = o3d.geometry.PointCloud()

  if "${options.shape}" == "diagonal":
    points = [[i, i, i] for i in range(${numPoints})]
  elif "${options.shape}" == "cube":
    loop_stop = ${numPoints} // 3
    points = [[i, j, k] for i in range(loop_stop) for j in range(loop_stop) for k in range(loop_stop)]

  if ${chaosOptions?.imputeNaN?.indices ? "True" : "False"}:
    for index in ${JSON.stringify(chaosOptions?.imputeNaN?.indices)}:
      points[index[0]][index[1]] = float("nan")

  pcd.points = o3d.utility.Vector3dVector(points)
  o3d.io.write_point_cloud("${outputPath}", pcd, write_ascii=True)
  `;

  const command = getPythonCommand([
    "-c",
    `$'${dedentPythonCode(pythonCode)}'`,
  ]);
  const proc = spawnSync(command, {
    shell: true,
    timeout: Duration.Seconds(5),
  });
  if (proc.stderr) {
    console.error(proc.stderr.toString());
  }

  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(`Pcd generation completed in ${timeTaken} milliseconds`);
};
