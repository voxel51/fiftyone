import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import {
  rosOdometryDecoders,
  rosPathDecoders,
  rosPoseArrayDecoders,
  rosPoseStampedDecoders,
} from "./ros/index";
import {
  ROS2_ODOMETRY_SCHEMA,
  ROS2_PATH_SCHEMA,
  ROS2_POSE_ARRAY_SCHEMA,
  ROS2_POSE_STAMPED_SCHEMA,
  decoderForSchemaEncoding,
  poseRecord,
  ros2Header,
  ros2Message,
  schemaData,
  vectorRecord,
} from "./ros.test-helpers";

describe("ROS pose and path decoders", () => {
  it("decodes ros2 PoseStamped and Odometry into pose visualizations", () => {
    const poseStamped = decoderForSchemaEncoding(
      rosPoseStampedDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_POSE_STAMPED_SCHEMA, {
        header: ros2Header({ frameId: "map", nanosec: 10, sec: 9 }),
        pose: poseRecord([1, 2, 3], [0, 0, 0, 1]),
      }),
      { schemaData: schemaData(ROS2_POSE_STAMPED_SCHEMA) },
    );
    const odometry = decoderForSchemaEncoding(
      rosOdometryDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_ODOMETRY_SCHEMA, {
        child_frame_id: "base_link",
        header: ros2Header({ frameId: "odom", nanosec: 12, sec: 11 }),
        pose: {
          covariance: Array(36).fill(0),
          pose: poseRecord([4, 5, 6], [0, 0, 0, 1]),
        },
        twist: {
          covariance: Array(36).fill(0),
          twist: {
            angular: vectorRecord([0.1, 0.2, 0.3]),
            linear: vectorRecord([7, 8, 9]),
          },
        },
      }),
      { schemaData: schemaData(ROS2_ODOMETRY_SCHEMA) },
    );

    expect(poseStamped.visualization?.kind).toBe(VISUALIZATION_KIND.POSE);
    expect(odometry.visualization?.kind).toBe(VISUALIZATION_KIND.POSE);
    if (
      poseStamped.visualization?.kind !== VISUALIZATION_KIND.POSE ||
      odometry.visualization?.kind !== VISUALIZATION_KIND.POSE
    ) {
      throw new Error("Expected pose visualizations");
    }
    expect(poseStamped.visualization).toMatchObject({
      coordinateFrameId: "map",
      position: [1, 2, 3],
      timestampNs: 9_000_000_010n,
    });
    expect(odometry.visualization).toMatchObject({
      angularVelocity: [0.1, 0.2, 0.3],
      coordinateFrameId: "odom",
      position: [4, 5, 6],
      timestampNs: 11_000_000_012n,
      velocity: [7, 8, 9],
    });
    expect(odometry.attributes).toMatchObject({ childFrameId: "base_link" });
  });

  it("decodes ros2 Path and PoseArray into scene-update overlays", () => {
    const path = decoderForSchemaEncoding(rosPathDecoders, "ros2msg").decode(
      ros2Message(ROS2_PATH_SCHEMA, {
        header: ros2Header({ frameId: "map", nanosec: 14, sec: 13 }),
        poses: [
          {
            header: ros2Header({ frameId: "map", nanosec: 1, sec: 1 }),
            pose: poseRecord([1, 2, 0], [0, 0, 0, 1]),
          },
          {
            header: ros2Header({ frameId: "map", nanosec: 2, sec: 1 }),
            pose: poseRecord([3, 4, 0], [0, 0, 0, 1]),
          },
        ],
      }),
      { schemaData: schemaData(ROS2_PATH_SCHEMA), streamId: "/planned_path" },
    );
    const poseArray = decoderForSchemaEncoding(
      rosPoseArrayDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_POSE_ARRAY_SCHEMA, {
        header: ros2Header({ frameId: "map", nanosec: 16, sec: 15 }),
        poses: [
          poseRecord([5, 6, 0], [0, 0, 0, 1]),
          poseRecord([7, 8, 0], [0, 0, 1, 0]),
        ],
      }),
      {
        schemaData: schemaData(ROS2_POSE_ARRAY_SCHEMA),
        streamId: "/pose_hypotheses",
      },
    );

    expect(path.visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    expect(poseArray.visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    if (
      path.visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE ||
      poseArray.visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE
    ) {
      throw new Error("Expected scene update visualizations");
    }
    expect(path.visualization.entities[0]).toMatchObject({
      frameId: "map",
      id: "/planned_path:path",
      lineCount: 1,
      timestampNs: 13_000_000_014n,
    });
    expect(path.visualization.entities[0]?.lines[0]?.points).toEqual([
      [1, 2, 0],
      [3, 4, 0],
    ]);
    expect(path.attributes).toMatchObject({
      frameId: "map",
      pointCount: 2,
      poseCount: 2,
    });
    expect(poseArray.visualization.entities[0]).toMatchObject({
      arrowCount: 2,
      frameId: "map",
      id: "/pose_hypotheses:pose-array",
      timestampNs: 15_000_000_016n,
    });
    expect(
      poseArray.visualization.entities[0]?.arrows[0]?.pose.position,
    ).toEqual([5, 6, 0]);
    expect(poseArray.attributes).toMatchObject({
      frameId: "map",
      poseCount: 2,
      renderedPoseCount: 2,
    });
  });
});
