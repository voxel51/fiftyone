import { parse, Root } from "protobufjs";
import { describe, expect, it } from "vitest";
import { decodeFoxgloveFrameTransformPayload } from "./foxglove-frame-transform-decoder";
import { BUILTIN_SCHEMA_CODEC_REGISTRY } from "./schema-codec-registry";

const root = new Root();
parse(
  `syntax = "proto3";
package google.protobuf;

message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}`,
  root
);
parse(
  `syntax = "proto3";
package foxglove;

message Vector3 {
  double x = 1;
  double y = 2;
  double z = 3;
}

message Quaternion {
  double x = 1;
  double y = 2;
  double z = 3;
  double w = 4;
}

message FrameTransform {
  google.protobuf.Timestamp timestamp = 1;
  string parent_frame_id = 2;
  string child_frame_id = 3;
  Vector3 translation = 4;
  Quaternion rotation = 5;
}`,
  root
);
root.resolveAll();

const frameTransformType = root.lookupType("foxglove.FrameTransform");

function createFrameTransformPayload() {
  return frameTransformType
    .encode(
      frameTransformType.create({
        childFrameId: "lidar",
        parentFrameId: "map",
        rotation: { w: 1 },
        timestamp: { seconds: 1, nanos: 2 },
        translation: { x: 1, y: 2, z: 3 },
      })
    )
    .finish();
}

describe("foxglove frame-transform decoder", () => {
  it("decodes Foxglove protobuf frame transforms", () => {
    const decoded = decodeFoxgloveFrameTransformPayload(
      createFrameTransformPayload()
    );

    expect(decoded).toEqual([
      {
        parentFrameId: "map",
        childFrameId: "lidar",
        translation: [1, 2, 3],
        rotation: [0, 0, 0, 1],
      },
    ]);
  });

  it("registers Foxglove transform decoding in the schema registry", () => {
    const decoded = BUILTIN_SCHEMA_CODEC_REGISTRY.decodeTransformPayload(
      "foxglove.FrameTransform",
      createFrameTransformPayload()
    );

    expect(decoded).toEqual([
      {
        parentFrameId: "map",
        childFrameId: "lidar",
        translation: [1, 2, 3],
        rotation: [0, 0, 0, 1],
      },
    ]);
  });
});
