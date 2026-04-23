import { parse, Root } from "protobufjs";
import { describe, expect, it } from "vitest";
import { decodeFoxglovePointCloudPayload } from "./foxglove-pointcloud-decoder";
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

message Pose {
  Vector3 position = 1;
  Quaternion orientation = 2;
}

message PackedElementField {
  enum NumericType {
    UNKNOWN = 0;
    UINT8 = 1;
    INT8 = 2;
    UINT16 = 3;
    INT16 = 4;
    UINT32 = 5;
    INT32 = 6;
    FLOAT32 = 7;
    FLOAT64 = 8;
  }

  string name = 1;
  fixed32 offset = 2;
  NumericType type = 3;
}

message PointCloud {
  google.protobuf.Timestamp timestamp = 1;
  string frame_id = 2;
  Pose pose = 3;
  fixed32 point_stride = 4;
  repeated PackedElementField fields = 5;
  bytes data = 6;
}`,
  root
);
root.resolveAll();

const pointCloudType = root.lookupType("foxglove.PointCloud");

function createPointCloudPayload({
  fields,
  pointStride,
  data,
  pose,
}: {
  fields: Array<{ name: string; offset: number; type: number }>;
  pointStride: number;
  data: Uint8Array;
  pose?: {
    position?: { x?: number; y?: number; z?: number };
    orientation?: { x?: number; y?: number; z?: number; w?: number };
  };
}) {
  return pointCloudType
    .encode(
      pointCloudType.create({
        data,
        fields,
        frameId: "lidar",
        pointStride,
        pose,
        timestamp: { seconds: 1, nanos: 2 },
      })
    )
    .finish();
}

describe("foxglove pointcloud decoder", () => {
  it("extracts XYZ, intensity, and bounds from Foxglove point clouds", () => {
    const data = new Uint8Array(32);
    const view = new DataView(data.buffer);

    view.setFloat32(0, 1, true);
    view.setFloat32(4, 2, true);
    view.setFloat32(8, 3, true);
    view.setFloat32(12, 0.25, true);
    view.setFloat32(16, 4, true);
    view.setFloat32(20, 5, true);
    view.setFloat32(24, 6, true);
    view.setFloat32(28, 0.75, true);

    const decoded = decodeFoxglovePointCloudPayload(
      createPointCloudPayload({
        data,
        fields: [
          { name: "x", offset: 0, type: 7 },
          { name: "y", offset: 4, type: 7 },
          { name: "z", offset: 8, type: 7 },
          { name: "intensity", offset: 12, type: 7 },
        ],
        pointStride: 16,
      })
    );
    const primitive = decoded.frame.primitives[0];

    expect(decoded.frame.pointCount).toBe(2);
    expect(decoded.frame.frameId).toBe("lidar");
    expect(primitive?.kind).toBe("points");
    expect(Array.from(primitive?.positions ?? [])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(primitive?.intensity ?? [])).toEqual([0.25, 0.75]);
    expect(decoded.frame.bounds).toEqual({
      min: [1, 2, 3],
      max: [4, 5, 6],
    });
  });

  it("falls back to rcs when intensity is absent", () => {
    const data = new Uint8Array(16);
    const view = new DataView(data.buffer);

    view.setFloat32(0, 1, true);
    view.setFloat32(4, 2, true);
    view.setFloat32(8, 3, true);
    view.setFloat32(12, 0.5, true);

    const decoded = decodeFoxglovePointCloudPayload(
      createPointCloudPayload({
        data,
        fields: [
          { name: "x", offset: 0, type: 7 },
          { name: "y", offset: 4, type: 7 },
          { name: "z", offset: 8, type: 7 },
          { name: "rcs", offset: 12, type: 7 },
        ],
        pointStride: 16,
      })
    );

    expect(Array.from(decoded.frame.primitives[0]?.intensity ?? [])).toEqual([
      0.5,
    ]);
  });

  it("applies point-cloud poses before returning the frame", () => {
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);

    view.setFloat32(0, 1, true);
    view.setFloat32(4, 2, true);
    view.setFloat32(8, 3, true);

    const decoded = decodeFoxglovePointCloudPayload(
      createPointCloudPayload({
        data,
        fields: [
          { name: "x", offset: 0, type: 7 },
          { name: "y", offset: 4, type: 7 },
          { name: "z", offset: 8, type: 7 },
        ],
        pointStride: 12,
        pose: {
          orientation: { w: 1 },
          position: { x: 10, y: 0, z: 0 },
        },
      })
    );

    expect(Array.from(decoded.frame.primitives[0]?.positions ?? [])).toEqual([
      11, 2, 3,
    ]);
  });

  it("rejects payloads without XYZ fields", () => {
    expect(() => {
      decodeFoxglovePointCloudPayload(
        createPointCloudPayload({
          data: new Uint8Array(4),
          fields: [{ name: "intensity", offset: 0, type: 7 }],
          pointStride: 4,
        })
      );
    }).toThrow(/missing x, y, or z fields/i);
  });

  it("registers Foxglove point-cloud decoding in the schema registry", async () => {
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);

    view.setFloat32(0, 1, true);
    view.setFloat32(4, 2, true);
    view.setFloat32(8, 3, true);

    const decoded = await BUILTIN_SCHEMA_CODEC_REGISTRY.decodeScene3dMessage(
      "foxglove.PointCloud",
      {
        logTimeNs: 10,
        messageId: "cloud-1",
        payload: createPointCloudPayload({
          data,
          fields: [
            { name: "x", offset: 0, type: 7 },
            { name: "y", offset: 4, type: 7 },
            { name: "z", offset: 8, type: 7 },
          ],
          pointStride: 12,
        }),
        publishTimeNs: 11,
        syncTimestampNs: 10,
      }
    );

    expect(decoded.frame.pointCount).toBe(1);
    expect(decoded.frame.frameId).toBe("lidar");
  });
});
