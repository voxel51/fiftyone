/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import fs from "node:fs";
import path from "node:path";
import type { MediaOptions } from "./types";
import { generateOnce } from "./write";

/**
 * A scene material as `fiftyone.core.threed` serializes one, e.g.
 * `{ _type: "MeshBasicMaterial", color: "blue", opacity: 0.8 }`. A material
 * of the node's default `_type` overrides only the fields it names.
 */
export type SceneMaterial = { _type?: string } & Record<string, unknown>;

/** Placement and look of one scene asset; every field has a default. */
export interface SceneNodeSpec {
  /** @default the asset's file name */
  name?: string;
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  /** A uniform scale or one per axis. */
  scale?: number | [number, number, number];
  material?: SceneMaterial;
  /** Renders a PLY asset as points. */
  isPointCloud?: boolean;
}

/** One asset node of a `.fo3d` scene tree. */
export interface SceneNode extends SceneNodeSpec {
  type: "PlyMesh" | "PointCloud" | "StlMesh";
  /** Absolute path to the node's `.ply`, `.pcd` or `.stl` asset. */
  assetPath: string;
}

/** The scene camera, over the default perspective camera looking along Z-up. */
export interface SceneCamera {
  position?: [number, number, number];
  lookAt?: [number, number, number];
  up?: "X" | "Y" | "Z";
  fov?: number;
  near?: number;
  far?: number;
}

export interface Fo3dOptions extends MediaOptions {
  nodes: SceneNode[];
  camera?: SceneCamera;
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

const material = (
  defaults: Record<string, unknown>,
  override: SceneMaterial | undefined,
) =>
  !override
    ? defaults
    : !override._type || override._type === defaults._type
      ? { ...defaults, ...override }
      : override;

/** A node as `fiftyone.core.threed.Object3D.as_dict` serializes it. */
const serializeNode = (node: SceneNode) => {
  const scale = node.scale ?? [1, 1, 1];
  const common = {
    _type: node.type,
    name: node.name ?? path.basename(node.assetPath),
    visible: true,
    position: node.position ?? [0, 0, 0],
    quaternion: node.quaternion ?? [0, 0, 0, 1],
    scale: typeof scale === "number" ? [scale, scale, scale] : scale,
    children: [] as never[],
  };
  switch (node.type) {
    case "PlyMesh":
      return {
        ...common,
        plyPath: node.assetPath,
        ...(node.isPointCloud ? { isPointCloud: true } : {}),
        defaultMaterial: material(MESH_MATERIAL, node.material),
      };
    case "StlMesh":
      return {
        ...common,
        stlPath: node.assetPath,
        defaultMaterial: material(MESH_MATERIAL, node.material),
      };
    default:
      return {
        ...common,
        pcdPath: node.assetPath,
        centerGeometry: false,
        flagForProjection: false,
        defaultMaterial: material(POINT_CLOUD_MATERIAL, node.material),
      };
  }
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
      ...options.camera,
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
