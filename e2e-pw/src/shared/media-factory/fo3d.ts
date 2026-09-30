/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import fs from "node:fs";
import path from "node:path";
import type { MediaOptions } from "./types";
import { generateOnce } from "./write";

/** One asset node of a `.fo3d` scene tree, with an optional transform. */
export interface SceneNode {
  type: "PlyMesh" | "PointCloud";
  /** Absolute path to the node's `.ply` or `.pcd` asset. */
  assetPath: string;
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  scale?: [number, number, number];
}

export interface Fo3dOptions extends MediaOptions {
  nodes: SceneNode[];
}

const MESH_MATERIAL = {
  _type: "MeshStandardMaterial",
  color: "#ffffff",
  emissiveColor: "#000000",
  emissiveIntensity: 0,
  metalness: 0,
  roughness: 1,
  opacity: 1,
  wireframe: false,
};

const POINT_CLOUD_MATERIAL = {
  _type: "PointCloudMaterial",
  opacity: 1,
  shadingMode: "height",
  customColor: "#ffffff",
  pointSize: 1,
  attenuateByDistance: false,
};

/** A node as `fiftyone.core.threed.Object3D.as_dict` serializes it. */
const serializeNode = (node: SceneNode) => {
  const common = {
    _type: node.type,
    name: path.basename(node.assetPath),
    visible: true,
    position: node.position ?? [0, 0, 0],
    quaternion: node.quaternion ?? [0, 0, 0, 1],
    scale: node.scale ?? [1, 1, 1],
    children: [] as never[],
  };
  return node.type === "PlyMesh"
    ? { ...common, plyPath: node.assetPath, defaultMaterial: MESH_MATERIAL }
    : {
        ...common,
        pcdPath: node.assetPath,
        centerGeometry: false,
        flagForProjection: false,
        defaultMaterial: POINT_CLOUD_MATERIAL,
      };
};

/**
 * Writes a `.fo3d` scene whose root holds `nodes`, in the FiftyOne scene
 * format, usable directly as a `media_type="3d"` sample filepath.
 */
export const createFo3d = (options: Fo3dOptions): void => {
  const scene: Record<string, unknown> = {
    __FO3D_VERSION: "0",
    _type: "Scene",
    name: "root",
    visible: true,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1],
    defaultMaterial: MESH_MATERIAL,
    children: options.nodes.map(serializeNode),
    camera: {
      position: null,
      lookAt: null,
      up: "Z",
      fov: 50,
      aspect: 1,
      near: 0.1,
      far: 5000,
    },
    background: {
      color: null,
      image: null,
      cube: null,
      intensity: 1,
    },
    lights: null,
  };

  generateOnce("Fo3d", options, () => {
    fs.writeFileSync(options.outputPath, JSON.stringify(scene));
  });
};
