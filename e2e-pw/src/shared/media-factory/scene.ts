/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createFo3d } from "./fo3d";
import { createPly } from "./ply";

/**
 * Options for a `.fo3d` scene wrapping a single generated PLY mesh.
 */
export interface SceneOptions {
  /** Geometry of the PLY asset. */
  shape: "cube" | "point-cloud";
  /** Point count for `point-cloud` shapes. */
  numPoints?: number;
  /** RGB vertex color of the PLY asset. */
  color?: [number, number, number];
}

export const DEFAULT_SCENE_OPTIONS: SceneOptions = { shape: "cube" };

/**
 * Writes `<outputPath>.ply` and a `<outputPath>.fo3d` scene referencing it,
 * and returns the scene path. A single cube is enough geometry for the 3D
 * viewer to mount and frame the scene.
 *
 * @example
 * const scenePath = createScene({ outputPath: "/tmp/scenes/0" });
 */
export const createScene = ({
  outputPath,
  ...options
}: Partial<SceneOptions> & { outputPath: string }): string => {
  const plyPath = `${outputPath}.ply`;
  const scenePath = `${outputPath}.fo3d`;
  createPly({ outputPath: plyPath, ...DEFAULT_SCENE_OPTIONS, ...options });
  createFo3d({ outputPath: scenePath, plyPath });
  return scenePath;
};
