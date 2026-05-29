/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import fs from "node:fs";

/**
 * Writes a minimal `.fo3d` scene file that wraps a single PLY mesh asset.
 *
 * The resulting file is valid JSON in the FiftyOne scene format and can be
 * used directly as a `media_type="3d"` sample filepath.
 *
 * @param outputPath - Destination path for the `.fo3d` file.
 * @param plyPath - Absolute path to the PLY file the scene should reference.
 */
export const createFo3d = ({
  outputPath,
  plyPath,
}: {
  outputPath: string;
  plyPath: string;
}) => {
  const meshMaterial = {
    _type: "MeshStandardMaterial",
    color: "#ffffff",
    emissiveColor: "#000000",
    emissiveIntensity: 0,
    metalness: 0,
    roughness: 1,
    opacity: 1,
    vertexColors: true,
    wireframe: false,
  };

  const scene: Record<string, unknown> = {
    _type: "Scene",
    name: "root",
    visible: true,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1],
    defaultMaterial: meshMaterial,
    children: [
      {
        _type: "PlyMesh",
        name: "mesh",
        visible: true,
        position: [0, 0, 0],
        quaternion: [0, 0, 0, 1],
        scale: [1, 1, 1],
        plyPath,
        defaultMaterial: meshMaterial,
        children: [],
      },
    ],
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

  fs.writeFileSync(outputPath, JSON.stringify(scene));
};
