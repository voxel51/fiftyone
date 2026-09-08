import { describe, expect, it } from "vitest";
import {
  isCameraCalibrationStream,
  isCompressedImageStream,
  isGridStream,
  isImageAnnotationsStream,
  isImageStream,
  isLocationFixStream,
  isLogStream,
  isPointCloudStream,
  isPoseStream,
  isSceneUpdateStream,
  streamTopics,
} from "../resource-client/stream-topics";
import { createMcapDecoderRegistry } from ".";
import {
  ROS_CAMERA_INFO_PAYLOADS,
  ROS_COMPRESSED_IMAGE_PAYLOADS,
  ROS_DETECTION_2D_ARRAY_PAYLOADS,
  ROS_DETECTION_3D_ARRAY_PAYLOADS,
  ROS_DIAGNOSTIC_ARRAY_PAYLOADS,
  ROS_IMAGE_PAYLOADS,
  ROS_LASER_SCAN_PAYLOADS,
  ROS_MARKER_ARRAY_PAYLOADS,
  ROS_NAV_SAT_FIX_PAYLOADS,
  ROS_OCCUPANCY_GRID_PAYLOADS,
  ROS_ODOMETRY_PAYLOADS,
  ROS_PATH_PAYLOADS,
  ROS_POINT_CLOUD2_PAYLOADS,
  ROS_POSE_ARRAY_PAYLOADS,
  ROS_POSE_STAMPED_PAYLOADS,
  ROS_RCL_LOG_PAYLOADS,
  ROS_ROSGRAPH_LOG_PAYLOADS,
} from "./ros/index";
import { createTopic } from "./ros.test-helpers";

describe("ROS decoder registry and stream classification", () => {
  it("registers every ROS payload with the MCAP decoder registry", () => {
    const registry = createMcapDecoderRegistry();
    const payloads = [
      ...ROS_CAMERA_INFO_PAYLOADS,
      ...ROS_COMPRESSED_IMAGE_PAYLOADS,
      ...ROS_DETECTION_2D_ARRAY_PAYLOADS,
      ...ROS_DETECTION_3D_ARRAY_PAYLOADS,
      ...ROS_DIAGNOSTIC_ARRAY_PAYLOADS,
      ...ROS_IMAGE_PAYLOADS,
      ...ROS_LASER_SCAN_PAYLOADS,
      ...ROS_NAV_SAT_FIX_PAYLOADS,
      ...ROS_OCCUPANCY_GRID_PAYLOADS,
      ...ROS_ODOMETRY_PAYLOADS,
      ...ROS_PATH_PAYLOADS,
      ...ROS_POINT_CLOUD2_PAYLOADS,
      ...ROS_POSE_ARRAY_PAYLOADS,
      ...ROS_POSE_STAMPED_PAYLOADS,
      ...ROS_RCL_LOG_PAYLOADS,
      ...ROS_ROSGRAPH_LOG_PAYLOADS,
    ];

    for (const payload of payloads) {
      expect(registry.find(payload), JSON.stringify(payload)).toBeDefined();
    }
  });

  it("classifies ROS streams with the same payload descriptors the registry uses", () => {
    const compressed = createTopic("/camera/compressed", {
      encoding: "cdr",
      schema: "sensor_msgs/msg/CompressedImage",
      schemaEncoding: "ros2idl",
    });
    const rawImage = createTopic("/camera/image", {
      encoding: "cdr",
      schema: "sensor_msgs/msg/Image",
      schemaEncoding: "ros2msg",
    });
    const cloud = createTopic("/points", {
      encoding: "ros1",
      schema: "sensor_msgs/PointCloud2",
      schemaEncoding: "ros1msg",
    });
    const scan = createTopic("/scan", {
      encoding: "cdr",
      schema: "sensor_msgs/msg/LaserScan",
      schemaEncoding: "ros2msg",
    });
    const markers = createTopic("/markers", ROS_MARKER_ARRAY_PAYLOADS[1]);
    const path = createTopic("/planned_path", ROS_PATH_PAYLOADS[1]);
    const poseArray = createTopic(
      "/pose_hypotheses",
      ROS_POSE_ARRAY_PAYLOADS[1],
    );
    const detections2d = createTopic(
      "/detections2d",
      ROS_DETECTION_2D_ARRAY_PAYLOADS[1],
    );
    const detections3d = createTopic(
      "/detections3d",
      ROS_DETECTION_3D_ARRAY_PAYLOADS[1],
    );
    const logs = createTopic("/rosout", ROS_RCL_LOG_PAYLOADS[0]);
    const diagnostics = createTopic(
      "/diagnostics",
      ROS_DIAGNOSTIC_ARRAY_PAYLOADS[1],
    );

    expect(isCompressedImageStream(compressed)).toBe(true);
    expect(isCompressedImageStream(rawImage)).toBe(false);
    expect(isImageStream(compressed)).toBe(true);
    expect(isImageStream(rawImage)).toBe(true);
    expect(isPointCloudStream(cloud)).toBe(true);
    expect(isPointCloudStream(scan)).toBe(true);
    expect(
      isCameraCalibrationStream(
        createTopic("/camera/info", ROS_CAMERA_INFO_PAYLOADS[1]),
      ),
    ).toBe(true);
    expect(
      isPoseStream(createTopic("/pose", ROS_POSE_STAMPED_PAYLOADS[1])),
    ).toBe(true);
    expect(isPoseStream(createTopic("/odom", ROS_ODOMETRY_PAYLOADS[1]))).toBe(
      true,
    );
    expect(
      isLocationFixStream(createTopic("/gps", ROS_NAV_SAT_FIX_PAYLOADS[0])),
    ).toBe(true);
    expect(
      isGridStream(createTopic("/map", ROS_OCCUPANCY_GRID_PAYLOADS[0])),
    ).toBe(true);
    expect(isSceneUpdateStream(markers)).toBe(true);
    expect(isSceneUpdateStream(path)).toBe(true);
    expect(isSceneUpdateStream(poseArray)).toBe(true);
    expect(isImageAnnotationsStream(detections2d)).toBe(true);
    expect(isSceneUpdateStream(detections3d)).toBe(true);
    expect(isLogStream(logs)).toBe(true);
    expect(isLogStream(diagnostics)).toBe(true);
    expect(
      streamTopics([
        compressed,
        rawImage,
        cloud,
        scan,
        markers,
        path,
        poseArray,
        detections2d,
        detections3d,
        logs,
        diagnostics,
      ]),
    ).toMatchObject({
      annotations: ["/detections2d"],
      image: ["/camera/compressed", "/camera/image"],
      logs: ["/rosout", "/diagnostics"],
      pointCloud: ["/points", "/scan"],
      previewable: [
        "/camera/compressed",
        "/camera/image",
        "/points",
        "/scan",
        "/rosout",
        "/diagnostics",
      ],
      sceneUpdates: [
        "/markers",
        "/planned_path",
        "/pose_hypotheses",
        "/detections3d",
      ],
    });
  });
});
