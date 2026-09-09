import { describe, expect, it } from "vitest";
import {
  rosDiagnosticArrayDecoders,
  rosRclLogDecoders,
  rosRosgraphLogDecoders,
} from "./ros/index";
import {
  ROS1_LOG_SCHEMA,
  ROS2_DIAGNOSTIC_ARRAY_SCHEMA,
  ROS2_RCL_LOG_SCHEMA,
  decoderForSchemaEncoding,
  ros1Header,
  ros1Message,
  ros2Header,
  ros2Message,
  schemaData,
} from "./ros.test-helpers";

describe("ROS log decoders", () => {
  it("decodes ROS log and diagnostics records into console rows", () => {
    const rosgraph = decoderForSchemaEncoding(
      rosRosgraphLogDecoders,
      "ros1msg",
    ).decode(
      ros1Message(ROS1_LOG_SCHEMA, {
        file: "planner.cpp",
        function: "tick",
        header: ros1Header({ frameId: "rosout", nsec: 8, sec: 7, seq: 3 }),
        level: 8,
        line: 42,
        msg: "planner failed",
        name: "planner",
        topics: ["/plan"],
      }),
      { schemaData: schemaData(ROS1_LOG_SCHEMA) },
    );
    const rcl = decoderForSchemaEncoding(rosRclLogDecoders, "ros2msg").decode(
      ros2Message(ROS2_RCL_LOG_SCHEMA, {
        file: "controller.cpp",
        function: "update",
        level: 30,
        line: 10,
        msg: "tracking degraded",
        name: "controller",
        stamp: { nanosec: 4, sec: 5 },
      }),
      { schemaData: schemaData(ROS2_RCL_LOG_SCHEMA) },
    );
    const diagnostics = decoderForSchemaEncoding(
      rosDiagnosticArrayDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_DIAGNOSTIC_ARRAY_SCHEMA, {
        header: ros2Header({ frameId: "base", nanosec: 9, sec: 6 }),
        status: [
          {
            hardware_id: "lidar-top",
            level: 2,
            message: "packet drops",
            name: "driver",
            values: [{ key: "drop_rate", value: "0.2" }],
          },
        ],
      }),
      { schemaData: schemaData(ROS2_DIAGNOSTIC_ARRAY_SCHEMA) },
    );

    expect(rosgraph.attributes?.logRows).toEqual([
      expect.objectContaining({
        file: "planner.cpp",
        functionName: "tick",
        level: "error",
        line: 42,
        message: "planner failed",
        name: "planner",
        timestampNs: 7_000_000_008n,
        topics: ["/plan"],
      }),
    ]);
    expect(rosgraph.timing?.sourceTimestamps?.messageTime).toBe(7_000_000_008n);
    expect(rcl.attributes?.logRows).toEqual([
      expect.objectContaining({
        level: "warn",
        levelNumber: 30,
        message: "tracking degraded",
        timestampNs: 5_000_000_004n,
      }),
    ]);
    expect(diagnostics.attributes).toMatchObject({
      diagnosticCount: 1,
      errorCount: 1,
    });
    expect(diagnostics.attributes?.logRows).toEqual([
      expect.objectContaining({
        details: [{ key: "drop_rate", value: "0.2" }],
        hardwareId: "lidar-top",
        kind: "diagnostic",
        level: "error",
        message: "packet drops",
        name: "driver",
        status: "ERROR",
        timestampNs: 6_000_000_009n,
      }),
    ]);
  });
});
