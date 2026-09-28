import fs from "fs";
import { spawnSync } from "child_process";
import { Duration, getPythonCommand } from "src/oss/utils";
import { dedentPythonCode } from "src/oss/utils/dedent";
import { writeToTmpFile } from "src/oss/utils/fs";
import type { MediaOptions } from "./types";
import { generateOnce } from "./write";

/**
 * What to write into a PLY mesh; every field has a default.
 */
export interface PlySpec {
  /**
   * Geometry: a unit cube or a cubic grid of points.
   * @default "cube"
   */
  shape?: "cube" | "point-cloud";
  /**
   * Point count for `point-cloud` shapes.
   * @default 125
   */
  numPoints?: number;
  /**
   * RGB vertex color.
   * @default [64, 192, 255]
   */
  color?: [number, number, number];
}

export type PlyOptions = MediaOptions & PlySpec;

export const DEFAULT_PLY_SPEC: Required<PlySpec> = {
  shape: "cube",
  numPoints: 125,
  color: [64, 192, 255],
};

export const createPly = (options: PlyOptions): void => {
  const serializedOptions = JSON.stringify({ ...DEFAULT_PLY_SPEC, ...options });

  const pythonCode = `
  import json
  from pathlib import Path

  options = json.loads(r'''${serializedOptions}''')

  output_path = Path(options["outputPath"])
  output_path.parent.mkdir(parents=True, exist_ok=True)

  shape = options["shape"]
  num_points = int(options["numPoints"])
  color = options["color"]

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

  generateOnce("Ply", options, () => {
    const sourceFilePath = writeToTmpFile(dedentPythonCode(pythonCode), "py");
    const command = getPythonCommand([JSON.stringify(sourceFilePath)]);
    const proc = spawnSync(command, {
      shell: true,
      timeout: Duration.Seconds(5),
    });

    fs.unlinkSync(sourceFilePath);

    if (proc.error) {
      throw proc.error;
    }

    const stderr = proc.stderr ? proc.stderr.toString().trim() : "";
    if (proc.status !== 0) {
      throw new Error(
        `PLY generation failed with exit code ${proc.status}: ${
          stderr || "unknown error"
        }`,
      );
    }

    if (stderr) {
      console.warn(stderr);
    }
  });
};
