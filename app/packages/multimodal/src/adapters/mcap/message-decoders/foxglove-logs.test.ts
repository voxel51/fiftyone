import { describe, expect, it } from "vitest";
import { foxgloveLogCdrDecoders, foxgloveLogDecoder } from "./foxglove/index";
import {
  LOG_ROOT,
  LOG_SCHEMA_DATA,
  ROS2_LOG_SCHEMA,
  decoderForSchemaEncoding,
  ros2Message,
  schemaData,
} from "./foxglove.test-helpers";

describe("Foxglove log decoders", () => {
  it("decodes Foxglove Log protobuf and CDR payloads into console rows", () => {
    const Log = LOG_ROOT.lookupType("foxglove.Log");
    const protobuf = foxgloveLogDecoder.decode(
      Log.encode(
        Log.create({
          file: "planner.cpp",
          level: 4,
          line: 42,
          message: "planner failed",
          name: "planner",
          timestamp: { nanos: 9, seconds: 8 },
        }),
      ).finish(),
      { schemaData: LOG_SCHEMA_DATA },
    );
    const cdr = decoderForSchemaEncoding(
      foxgloveLogCdrDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_LOG_SCHEMA, {
        file: "controller.cpp",
        level: 3,
        line: 10,
        message: "tracking degraded",
        name: "controller",
        timestamp: { nanosec: 4, sec: 5 },
      }),
      { schemaData: schemaData(ROS2_LOG_SCHEMA) },
    );

    expect(protobuf.attributes?.logRows).toEqual([
      expect.objectContaining({
        file: "planner.cpp",
        level: "error",
        line: 42,
        message: "planner failed",
        name: "planner",
        timestampNs: 8_000_000_009n,
      }),
    ]);
    expect(protobuf.timing?.sourceTimestamps?.messageTime).toBe(8_000_000_009n);
    expect(cdr.attributes?.logRows).toEqual([
      expect.objectContaining({
        file: "controller.cpp",
        level: "warn",
        levelNumber: 3,
        line: 10,
        message: "tracking degraded",
        name: "controller",
        timestampNs: 5_000_000_004n,
      }),
    ]);
  });
});
