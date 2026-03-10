import { spawnSync } from "child_process";
import { Duration, getPythonCommand } from "src/oss/utils";
import { dedentPythonCode } from "src/oss/utils/dedent";

export const createPly = (options: {
  outputPath: string;
  shape: "cube" | "point-cloud";
  numPoints?: number;
  color?: [number, number, number];
}) => {
  const {
    outputPath,
    shape,
    numPoints = 125,
    color = [64, 192, 255],
  } = options;

  const startTime = performance.now();
  console.log(`Creating ply with options: ${JSON.stringify(options)}`);

  const pythonCode = `
  from pathlib import Path

  output_path = Path("${outputPath}")
  output_path.parent.mkdir(parents=True, exist_ok=True)

  shape = "${shape}"
  num_points = ${numPoints}
  color = ${JSON.stringify(color)}

  if shape == "cube":
    vertices = [
      (-0.5, -0.5, -0.5),
      (0.5, -0.5, -0.5),
      (0.5, 0.5, -0.5),
      (-0.5, 0.5, -0.5),
      (-0.5, -0.5, 0.5),
      (0.5, -0.5, 0.5),
      (0.5, 0.5, 0.5),
      (-0.5, 0.5, 0.5),
    ]
    faces = [
      (0, 1, 2),
      (0, 2, 3),
      (4, 6, 5),
      (4, 7, 6),
      (0, 4, 5),
      (0, 5, 1),
      (1, 5, 6),
      (1, 6, 2),
      (2, 6, 7),
      (2, 7, 3),
      (3, 7, 4),
      (3, 4, 0),
    ]
  else:
    loop_stop = max(2, int(round(num_points ** (1 / 3))))
    vertices = [
      (float(i), float(j), float(k))
      for i in range(loop_stop)
      for j in range(loop_stop)
      for k in range(loop_stop)
    ]
    faces = []

  header = [
    "ply",
    "format ascii 1.0",
    f"element vertex {len(vertices)}",
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    f"element face {len(faces)}",
    "property list uchar int vertex_indices",
    "end_header",
  ]

  with output_path.open("w", encoding="utf-8") as f:
    f.write("\\n".join(header))
    f.write("\\n")

    for x, y, z in vertices:
      f.write(
        f"{x:.6f} {y:.6f} {z:.6f} {color[0]} {color[1]} {color[2]}\\n"
      )

    for face in faces:
      indices = " ".join(str(idx) for idx in face)
      f.write(f"{len(face)} " + indices + "\\n")
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

  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log(`Ply generation completed in ${timeTaken} milliseconds`);
};
