import { describe, expect, it } from "vitest";
import { GaussianSplatAsset } from "../fo3d/render-types";
import type { FiftyoneSceneRawJson } from "../utils";
import { buildFoScene } from "./use-fo3d-scene-parser";

const DEFAULT_MATERIAL = {
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

const buildRawScene = (
  child: Partial<FiftyoneSceneRawJson>,
): FiftyoneSceneRawJson =>
  ({
    _type: "Scene",
    name: "root",
    visible: true,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1],
    defaultMaterial: DEFAULT_MATERIAL,
    camera: {
      position: null,
      lookAt: null,
      up: "Z",
      fov: 50,
      aspect: 1,
      near: 0.1,
      far: 5000,
    },
    background: null,
    lights: null,
    children: [
      {
        name: "reconstruction",
        visible: true,
        position: [0, 0, 0],
        quaternion: [0, 0, 0, 1],
        scale: [1, 1, 1],
        defaultMaterial: DEFAULT_MATERIAL,
        children: [],
        ...child,
      },
    ],
  }) as FiftyoneSceneRawJson;

describe("buildFoScene", () => {
  it("parses GaussianSplat nodes", () => {
    const scene = buildFoScene(
      buildRawScene({
        _type: "GaussianSplat",
        splatPath: "gaussians.spz",
        format: "spz",
        centerGeometry: false,
      } as Partial<FiftyoneSceneRawJson>),
    );

    const asset = scene.children[0].asset;

    expect(asset).toBeInstanceOf(GaussianSplatAsset);
    expect(asset).toMatchObject({
      splatPath: "gaussians.spz",
      format: "spz",
      centerGeometry: false,
    });
  });

  it("defaults GaussianSplat centerGeometry to true", () => {
    const scene = buildFoScene(
      buildRawScene({
        _type: "GaussianSplat",
        splatPath: "gaussians.splat",
      } as Partial<FiftyoneSceneRawJson>),
    );

    expect(scene.children[0].asset).toMatchObject({
      centerGeometry: true,
    });
  });
});
