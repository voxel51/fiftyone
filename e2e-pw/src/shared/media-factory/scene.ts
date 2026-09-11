/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createFo3d, type SceneNode } from "./fo3d";
import { createPcd, type PcdSpec } from "./pcd";
import { createPly, type PlySpec } from "./ply";
import type { MediaOptions } from "./types";

/**
 * The assets composed into a `.fo3d` scene: PLY meshes and PCD point clouds,
 * each generated from its own spec. Defaults to one cube mesh.
 */
export interface SceneSpec {
  meshes?: PlySpec[];
  pointClouds?: PcdSpec[];
}

export type SceneOptions = MediaOptions & SceneSpec;

export const DEFAULT_SCENE_SPEC: SceneSpec = { meshes: [{}] };

/**
 * Writes each asset as `<outputPath>-<i>.ply` / `.pcd` and a `<outputPath>.fo3d`
 * scene referencing them, and returns the scene path.
 *
 * @example
 * const scenePath = createScene({ outputPath: "/tmp/scenes/0" });
 */
export const createScene = ({
  outputPath,
  meshes,
  pointClouds,
}: SceneOptions): string => {
  const spec =
    meshes || pointClouds ? { meshes, pointClouds } : DEFAULT_SCENE_SPEC;
  const nodes: SceneNode[] = [
    ...(spec.meshes ?? []).map((mesh, index): SceneNode => {
      const assetPath = `${outputPath}-${index}.ply`;
      createPly({ outputPath: assetPath, ...mesh });
      return { type: "PlyMesh", assetPath };
    }),
    ...(spec.pointClouds ?? []).map((pointCloud, index): SceneNode => {
      const assetPath = `${outputPath}-${index}.pcd`;
      createPcd({ outputPath: assetPath, ...pointCloud });
      return { type: "PointCloud", assetPath };
    }),
  ];
  const scenePath = `${outputPath}.fo3d`;
  createFo3d({ outputPath: scenePath, nodes });
  return scenePath;
};
