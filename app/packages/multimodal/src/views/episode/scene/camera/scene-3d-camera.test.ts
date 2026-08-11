import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  cameraPoseFromTrackingAnchor,
  cameraTargetPoseFromFrameTransform,
  cameraTrackingAnchorFromPose,
  type Scene3dCameraTargetPose,
  type Scene3dFollowTrackingMode,
} from "./scene-3d-camera";
import type { PointCloudCameraPose } from "../../../../visualization/scene-3d/index";

describe("mcap 3d camera tracking", () => {
  it("follows target translation while preserving camera offset", () => {
    const anchor = anchorFrom({
      cameraPose: pose([12, 1, 3], [10, 0, 0]),
      mode: "position",
      targetPose: targetPose([10, 0, 0]),
    });

    expect(
      cameraPoseFromTrackingAnchor(anchor, targetPose([20, 5, 0])),
    ).toEqual(pose([22, 6, 3], [20, 5, 0]));
  });

  it("follows target heading around the z axis", () => {
    const anchor = anchorFrom({
      cameraPose: pose([1, 0, 0], [0, 0, 0]),
      mode: "heading",
      targetPose: targetPose([0, 0, 0]),
    });

    const followed = cameraPoseFromTrackingAnchor(
      anchor,
      targetPose(
        [0, 0, 0],
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
      ),
    );

    expect(followed.position[0]).toBeCloseTo(0);
    expect(followed.position[1]).toBeCloseTo(1);
    expect(followed.position[2]).toBeCloseTo(0);
    expect(followed.target).toEqual([0, 0, 0]);
  });

  it("follows target heading around the configured scene-up axis", () => {
    const anchor = anchorFrom({
      cameraPose: pose([1, 0, 0], [0, 0, 0]),
      mode: "heading",
      sceneUpAxis: "y",
      targetPose: targetPose([0, 0, 0]),
    });

    const followed = cameraPoseFromTrackingAnchor(
      anchor,
      targetPose(
        [0, 0, 0],
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
      ),
      "y",
    );

    expect(followed.position[0]).toBeCloseTo(0);
    expect(followed.position[1]).toBeCloseTo(0);
    expect(followed.position[2]).toBeCloseTo(-1);
    expect(followed.target).toEqual([0, 0, 0]);
  });

  it("follows the full target pose", () => {
    const anchor = anchorFrom({
      cameraPose: pose([0, 0, 1], [0, 0, 0]),
      mode: "pose",
      targetPose: targetPose([0, 0, 0]),
    });

    const followed = cameraPoseFromTrackingAnchor(
      anchor,
      targetPose(
        [0, 0, 0],
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
      ),
    );

    expect(followed.position[0]).toBeCloseTo(1);
    expect(followed.position[1]).toBeCloseTo(0);
    expect(followed.position[2]).toBeCloseTo(0);
    expect(followed.target).toEqual([0, 0, 0]);
  });

  it("treats a near-vertical heading forward axis as no rotation", () => {
    const anchor = anchorFrom({
      cameraPose: pose([1, 0, 0], [0, 0, 0]),
      mode: "heading",
      targetPose: targetPose([0, 0, 0]),
    });

    // Pitch the target straight up: its forward axis is vertical, so the
    // heading yaw is undefined and the follow rotation degrades to identity.
    const followed = cameraPoseFromTrackingAnchor(
      anchor,
      targetPose(
        [0, 0, 0],
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2),
      ),
    );

    expect(followed.position[0]).toBeCloseTo(1);
    expect(followed.position[1]).toBeCloseTo(0);
    expect(followed.position[2]).toBeCloseTo(0);
  });

  it("treats a degenerate zero rotation as identity for the target pose", () => {
    const target = cameraTargetPoseFromFrameTransform({
      rotation: new Quaternion(0, 0, 0, 0),
      sourceFrameId: "base_link",
      targetFrameId: "map",
      translation: new Vector3(1, 2, 3),
    });

    expect(target.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(target.translation.toArray()).toEqual([1, 2, 3]);
  });
});

function anchorFrom({
  cameraPose,
  mode,
  sceneUpAxis = "z",
  targetPose,
}: {
  readonly cameraPose: PointCloudCameraPose;
  readonly mode: Scene3dFollowTrackingMode;
  readonly sceneUpAxis?: "x" | "y" | "z";
  readonly targetPose: Scene3dCameraTargetPose;
}) {
  return cameraTrackingAnchorFromPose({
    cameraPose,
    mode,
    sceneUpAxis,
    targetFrameId: "base_link",
    targetPose,
    worldFrameId: "map",
  });
}

function pose(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
): PointCloudCameraPose {
  return { position, target };
}

function targetPose(
  translation: readonly [number, number, number],
  rotation = new Quaternion(),
): Scene3dCameraTargetPose {
  return {
    rotation,
    translation: new Vector3(...translation),
  };
}
