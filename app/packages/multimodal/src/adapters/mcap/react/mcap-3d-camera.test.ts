import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  cameraPoseFromTrackingAnchor,
  cameraTrackingAnchorFromPose,
  type Mcap3dCameraTargetPose,
  type Mcap3dFollowTrackingMode,
} from "./mcap-3d-camera";
import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";

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
});

function anchorFrom({
  cameraPose,
  mode,
  targetPose,
}: {
  readonly cameraPose: PointCloudCameraPose;
  readonly mode: Mcap3dFollowTrackingMode;
  readonly targetPose: Mcap3dCameraTargetPose;
}) {
  return cameraTrackingAnchorFromPose({
    cameraPose,
    mode,
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
): Mcap3dCameraTargetPose {
  return {
    rotation,
    translation: new Vector3(...translation),
  };
}
