/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  createFo3d,
  type SceneCamera,
  type SceneNode,
  type SceneNodeSpec,
} from "./fo3d";
import { createPcd, type PcdSpec } from "./pcd";
import { createPly, type PlySpec } from "./ply";
import { createStl, type StlSpec } from "./stl";
import type { MediaOptions } from "./types";

/**
 * The assets composed into a `.fo3d` scene: PLY meshes, PCD point clouds and
 * STL meshes, each generated from its own spec and placed by its
 * {@link SceneNodeSpec}. Defaults to one cube mesh.
 */
export interface SceneSpec {
  meshes?: (PlySpec & SceneNodeSpec)[];
  pointClouds?: (PcdSpec & SceneNodeSpec)[];
  stlMeshes?: (StlSpec & SceneNodeSpec)[];
  camera?: SceneCamera;
}

export type SceneOptions = MediaOptions & SceneSpec;

export const DEFAULT_SCENE_SPEC: SceneSpec = { meshes: [{}] };

const NODE_KEYS: (keyof SceneNodeSpec)[] = [
  "name",
  "position",
  "quaternion",
  "scale",
  "material",
  "isPointCloud",
];

/** The placement of a scene entry. */
const nodeSpec = (entry: SceneNodeSpec): SceneNodeSpec =>
  Object.fromEntries(NODE_KEYS.map((key) => [key, entry[key]]));

/** The asset spec of a scene entry, without its placement. */
const assetSpec = <T extends SceneNodeSpec>(entry: T) =>
  Object.fromEntries(
    Object.entries(entry).filter(
      ([key]) => !NODE_KEYS.includes(key as keyof SceneNodeSpec),
    ),
  ) as Omit<T, keyof SceneNodeSpec>;

/**
 * Writes each asset as `<outputPath>-<i>.ply` / `.pcd` / `.stl` and a
 * `<outputPath>.fo3d` scene referencing them, and returns the scene path.
 *
 * @example
 * const scenePath = createScene({ outputPath: "/tmp/scenes/0" });
 */
export const createScene = ({
  outputPath,
  meshes,
  pointClouds,
  stlMeshes,
  camera,
}: SceneOptions): string => {
  const spec =
    meshes || pointClouds || stlMeshes
      ? { meshes, pointClouds, stlMeshes }
      : DEFAULT_SCENE_SPEC;
  const nodes: SceneNode[] = [
    ...(spec.meshes ?? []).map((mesh, index): SceneNode => {
      const assetPath = `${outputPath}-${index}.ply`;
      createPly({ outputPath: assetPath, ...assetSpec(mesh) });
      return { type: "PlyMesh", assetPath, ...nodeSpec(mesh) };
    }),
    ...(spec.pointClouds ?? []).map((pointCloud, index): SceneNode => {
      const assetPath = `${outputPath}-${index}.pcd`;
      createPcd({ outputPath: assetPath, ...assetSpec(pointCloud) });
      return { type: "PointCloud", assetPath, ...nodeSpec(pointCloud) };
    }),
    ...(spec.stlMeshes ?? []).map((stl, index): SceneNode => {
      const assetPath = `${outputPath}-${index}.stl`;
      createStl({ outputPath: assetPath, ...assetSpec(stl) });
      return { type: "StlMesh", assetPath, ...nodeSpec(stl) };
    }),
  ];
  const scenePath = `${outputPath}.fo3d`;
  createFo3d({ outputPath: scenePath, nodes, camera });
  return scenePath;
};
