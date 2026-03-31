import type { ModalSample } from "@fiftyone/state";
import { describe, expect, it } from "vitest";
import { buildSyntheticSceneForDirect3dSamples } from "./synthetic-scene";

const buildModalSample = (
  filepath: string,
  mediaFieldPath = filepath
): ModalSample => {
  return {
    sample: {
      _id: filepath,
      filepath,
    },
    urls: {
      filepath: mediaFieldPath,
    },
  } as unknown as ModalSample;
};

describe("buildSyntheticSceneForDirect3dSamples", () => {
  it.each([
    ["/tmp/lidar/frame.pcd", "PointCloud", "pcdPath"],
    ["/tmp/lidar/frame.PCD", "PointCloud", "pcdPath"],
    ["/tmp/lidar/frame.ply", "PlyMesh", "plyPath"],
    ["/tmp/lidar/frame.gltf", "GltfMesh", "gltfPath"],
    ["/tmp/lidar/frame.glb", "GltfMesh", "gltfPath"],
    ["/tmp/lidar/frame.fbx", "FbxMesh", "fbxPath"],
    ["/tmp/lidar/frame.stl", "StlMesh", "stlPath"],
  ])(
    "maps %s into synthetic scene node",
    (path, expectedType, expectedPathField) => {
      const scene = buildSyntheticSceneForDirect3dSamples({
        sample: buildModalSample(path),
        mediaField: "filepath",
      });

      expect(scene).not.toBeNull();
      expect(scene.children).toHaveLength(1);
      expect(scene.children[0]._type).toBe(expectedType);
      expect(scene.children[0][expectedPathField]).toBe(path);
    }
  );

  it.each([
    ["/tmp/lidar/frame.gltf", "Y"],
    ["/tmp/lidar/frame.glb", "Y"],
    ["/tmp/lidar/frame.fbx", "Y"],
    ["/tmp/lidar/frame.pcd", "Z"],
    ["/tmp/lidar/frame.ply", "Z"],
    ["/tmp/lidar/frame.stl", "Z"],
  ])("sets camera.up for %s synthetic scenes to %s", (path, expectedUp) => {
    const scene = buildSyntheticSceneForDirect3dSamples({
      sample: buildModalSample(path),
      mediaField: "filepath",
    });

    expect(scene).not.toBeNull();
    expect(scene.camera.up).toBe(expectedUp);
  });

  it("sets camera.up=Z for mixed grouped scenes", () => {
    const sampleMap = {
      gltf: buildModalSample("/tmp/group/model.glb"),
      pcd: buildModalSample("/tmp/group/lidar.pcd"),
    };

    const scene = buildSyntheticSceneForDirect3dSamples({
      sample: sampleMap.gltf,
      mediaField: "filepath",
      sampleMap,
    });

    expect(scene).not.toBeNull();
    expect(scene.camera.up).toBe("Z");
  });

  it("builds one child for each grouped active 3d slice sample", () => {
    const sampleMap = {
      left: buildModalSample("/tmp/group/left.pcd"),
      right: buildModalSample("/tmp/group/right.ply"),
    };

    const scene = buildSyntheticSceneForDirect3dSamples({
      sample: sampleMap.left,
      mediaField: "filepath",
      sampleMap,
    });

    expect(scene).not.toBeNull();
    expect(scene.children).toHaveLength(2);
    expect(scene.children.map((node) => node.name).sort()).toEqual([
      "left",
      "right",
    ]);
  });

  it("returns null for unsupported direct assets", () => {
    const scene = buildSyntheticSceneForDirect3dSamples({
      sample: buildModalSample("/tmp/lidar/frame.obj"),
      mediaField: "filepath",
    });

    expect(scene).toBeNull();
  });
});
