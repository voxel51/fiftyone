import { spawnSync } from "child_process";
import { Duration, getPythonCommand } from "src/oss/utils";

/**
 * This function creates a new pcd file with the specified number of points.
 * The points are arranged in a diagonal line in 3D space.
 */
export const createPcd = (options: {
  outputPath: string;
  numPoints: number;
}) => {
  const { outputPath, numPoints } = options;
  const startTime = performance.now();
  console.log(`Creating blank pcd with options: ${JSON.stringify(options)}`);
  const pythonCode = `import open3d as o3d
  pcd = o3d.geometry.PointCloud()
  pcd.points = o3d.utility.Vector3dVector([[i, i, i] for i in range(${numPoints})])
  o3d.io.write_point_cloud('${outputPath}', pcd)`;

  const pythonCodeSingleLine = pythonCode.split("\n").join(";");
  const command = getPythonCommand(["-c", `"${pythonCodeSingleLine}"`]);
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
