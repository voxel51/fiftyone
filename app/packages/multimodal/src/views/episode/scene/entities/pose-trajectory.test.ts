import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../../visualization/index";
import {
  decimateTrajectory,
  defaultTrajectoryFrame,
  locationHudLine,
  poseMarkerSceneUpdate,
  speedHudLine,
  trajectorySceneUpdate,
  type PoseTrajectoryPoint,
} from "./pose-trajectory";

function point(index: number): PoseTrajectoryPoint {
  return { position: [index, index * 2, 0], timeNs: BigInt(index) };
}

describe("decimateTrajectory", () => {
  it("returns short trajectories unchanged", () => {
    const points = [point(0), point(1), point(2)];
    expect(decimateTrajectory(points, 5)).toBe(points);
  });

  it("decimates with a uniform stride and keeps the final point", () => {
    const points = Array.from({ length: 101 }, (_, index) => point(index));
    const decimated = decimateTrajectory(points, 11);

    expect(decimated).toHaveLength(11);
    expect(decimated[0]).toBe(points[0]);
    expect(decimated[10]).toBe(points[100]);
    // Uniform stride: samples land every ~10 source points.
    expect(decimated[5]?.timeNs).toBe(50n);
  });
});

describe("defaultTrajectoryFrame", () => {
  it("prefers global frames by name", () => {
    expect(defaultTrajectoryFrame(["base_link", "map", "CAM_FRONT"])).toBe(
      "map",
    );
    expect(defaultTrajectoryFrame(["odom", "world"])).toBe("world");
  });

  it("falls back to unframed when no global frame exists", () => {
    expect(defaultTrajectoryFrame(["base_link", "LIDAR_TOP"])).toBe("");
  });
});

describe("trajectorySceneUpdate", () => {
  it("builds one frame-locked line-strip entity", () => {
    const update = trajectorySceneUpdate({
      frameId: "map",
      points: [point(0), point(1), point(2)],
      stream: "/odom",
    });

    expect(update.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    expect(update.entities).toHaveLength(1);
    const entity = update.entities[0];
    expect(entity).toMatchObject({
      frameId: "map",
      frameLocked: true,
      id: "trajectory:/odom",
      lineCount: 1,
    });
    expect(entity?.lines[0]).toMatchObject({
      points: [
        [0, 0, 0],
        [1, 2, 0],
        [2, 4, 0],
      ],
      type: "line-strip",
    });
  });

  it("omits the frame id for unframed trajectories", () => {
    const update = trajectorySceneUpdate({
      frameId: "",
      points: [point(0), point(1)],
      stream: "/odom",
    });

    expect(update.entities[0]?.frameId).toBeUndefined();
  });
});

describe("poseMarkerSceneUpdate", () => {
  it("places a frame-locked RGB axes triad at the pose", () => {
    const update = poseMarkerSceneUpdate({
      frameId: "map",
      pose: {
        kind: VISUALIZATION_KIND.POSE,
        position: [10, 20, 0],
        quaternion: [0, 0, 0, 1],
      },
      stream: "/odom",
    });

    const entity = update.entities[0];
    expect(entity).toMatchObject({
      frameId: "map",
      frameLocked: true,
      id: "pose:/odom",
      arrowCount: 3,
      sphereCount: 0,
    });
    for (const arrow of entity?.arrows ?? []) {
      expect(arrow.pose.position).toEqual([10, 20, 0]);
      expect(arrow.shaftLength).toBeGreaterThan(0);
      expect(arrow.shaftDiameter).toBeGreaterThan(0);
    }
    // With an identity pose, X keeps identity and Y/Z get the fixed
    // +X-onto-axis rotations.
    expect(entity?.arrows[0]?.pose.quaternion).toEqual([0, 0, 0, 1]);
    expect(entity?.arrows[1]?.pose.quaternion[2]).toBeCloseTo(Math.SQRT1_2);
    expect(entity?.arrows[2]?.pose.quaternion[1]).toBeCloseTo(-Math.SQRT1_2);
    // Distinct RGB axis colors.
    const colors = new Set(
      (entity?.arrows ?? []).map((arrow) => JSON.stringify(arrow.color)),
    );
    expect(colors.size).toBe(3);
  });

  it("composes the pose orientation onto each axis arrow", () => {
    // 90° about Z: +X should land on +Y.
    const update = poseMarkerSceneUpdate({
      frameId: "map",
      pose: {
        kind: VISUALIZATION_KIND.POSE,
        position: [0, 0, 0],
        quaternion: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
      },
      stream: "/odom",
    });

    const [x, y, z, w] = update.entities[0]?.arrows[0]?.pose.quaternion ?? [];
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(Math.SQRT1_2);
    expect(w).toBeCloseTo(Math.SQRT1_2);
  });
});

describe("speedHudLine", () => {
  it("formats velocity magnitude in meters per second", () => {
    expect(speedHudLine([3, 4, 0])).toBe("5.0 m/s");
    expect(speedHudLine([6.45, 0, 0])).toBe("6.5 m/s");
  });

  it("returns null without a usable velocity", () => {
    expect(speedHudLine(undefined)).toBeNull();
    expect(speedHudLine([Number.NaN, 0, 0])).toBeNull();
  });
});

describe("locationHudLine", () => {
  it("formats coordinates to five decimal places", () => {
    expect(
      locationHudLine({ latitude: 42.349205398, longitude: -71.045759449 }),
    ).toBe("42.34921, -71.04576");
  });

  it("returns null without a usable fix", () => {
    expect(locationHudLine(undefined)).toBeNull();
    expect(locationHudLine({ latitude: Number.NaN, longitude: 1 })).toBeNull();
  });
});
