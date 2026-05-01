import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FO3D_CAMERA_LIFECYCLE, isFo3dSceneReady } from "../camera-lifecycle";
import type { FoScene } from "../render-types";

const makeScene = (): FoScene => ({
  position: new Vector3(0, 0, 0),
  quaternion: new Quaternion(),
  scale: new Vector3(1, 1, 1),
  background: null,
  cameraProps: {},
  lights: [],
  children: [],
});

describe("isFo3dSceneReady", () => {
  it("returns false when the parsed scene is still missing", () => {
    expect(
      isFo3dSceneReady({
        cameraLifecycleState: FO3D_CAMERA_LIFECYCLE.WAITING_FOR_SCENE,
        foScene: null,
        rootAssetCount: 0,
      })
    ).toBe(false);

    expect(
      isFo3dSceneReady({
        cameraLifecycleState: FO3D_CAMERA_LIFECYCLE.WAITING_FOR_SCENE,
        foScene: null,
        rootAssetCount: 1,
      })
    ).toBe(false);
  });

  it("treats an empty parsed scene as ready", () => {
    expect(
      isFo3dSceneReady({
        cameraLifecycleState: FO3D_CAMERA_LIFECYCLE.WAITING_FOR_SCENE,
        foScene: makeScene(),
        rootAssetCount: 0,
      })
    ).toBe(true);
  });

  it("still waits for lifecycle readiness when assets are present", () => {
    expect(
      isFo3dSceneReady({
        cameraLifecycleState: FO3D_CAMERA_LIFECYCLE.WAITING_FOR_SCENE,
        foScene: {
          ...makeScene(),
          children: [
            {
              name: "mesh",
              visible: true,
              position: new Vector3(0, 0, 0),
              quaternion: new Quaternion(),
              scale: new Vector3(1, 1, 1),
              children: null,
            },
          ],
        },
        rootAssetCount: 1,
      })
    ).toBe(false);
  });

  it("treats a non-empty scene as ready once the camera lifecycle is ready", () => {
    expect(
      isFo3dSceneReady({
        cameraLifecycleState: FO3D_CAMERA_LIFECYCLE.READY,
        foScene: {
          ...makeScene(),
          children: [
            {
              name: "mesh",
              visible: true,
              position: new Vector3(0, 0, 0),
              quaternion: new Quaternion(),
              scale: new Vector3(1, 1, 1),
              children: null,
            },
          ],
        },
        rootAssetCount: 1,
      })
    ).toBe(true);
  });
});
