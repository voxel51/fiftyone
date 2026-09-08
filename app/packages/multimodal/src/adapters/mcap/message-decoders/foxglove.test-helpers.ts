import { parse as parseRosMessageDefinition } from "@foxglove/rosmsg";
import { parseRos2idl } from "@foxglove/ros2idl-parser";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import { expect } from "vitest";
import type { Decoder } from "../../../decoders/index";
import type { PayloadDescriptor } from "../../../ir/index";
import type { StreamInventory } from "../../../schemas/v1/index";

export function text(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

export function compressedImageMessage(format?: string): Uint8Array {
  const fields = [protobufBytesField(2, new TextEncoder().encode("fake-jpeg"))];
  if (format !== undefined) {
    fields.push(protobufBytesField(3, new TextEncoder().encode(format)));
  }

  return concatProtobufFields(...fields);
}

export function compressedVideoMessage(format?: string): Uint8Array {
  const fields = [
    protobufBytesField(1, concatProtobufFields(protobufVarintField(1, 123456))),
    protobufBytesField(2, new TextEncoder().encode("CAM_VIDEO")),
    protobufBytesField(3, H264_KEYFRAME_BYTES),
  ];
  if (format !== undefined) {
    fields.push(protobufBytesField(4, new TextEncoder().encode(format)));
  }

  return concatProtobufFields(...fields);
}

export const H264_KEYFRAME_BYTES = Uint8Array.of(
  0,
  0,
  0,
  1,
  0x67,
  0x4d,
  0x00,
  0x1f,
  0,
  0,
  1,
  0x68,
  0xce,
  0,
  0,
  1,
  0x65,
  0xb0,
);

export interface TestPointCloudField {
  readonly name: string;
  readonly offset: number;
  readonly type: number;
}

export interface TestPointCloudPose {
  readonly orientation?: {
    readonly w?: number;
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
  };
  readonly position?: {
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
  };
}

export function pointCloudMessage(
  data: Uint8Array,
  {
    fields = [
      { name: "x", offset: 0, type: 7 },
      { name: "y", offset: 4, type: 7 },
      { name: "z", offset: 8, type: 7 },
    ],
    pose,
    pointStride = 12,
  }: {
    readonly fields?: readonly TestPointCloudField[];
    readonly pose?: TestPointCloudPose;
    readonly pointStride?: number;
  } = {},
): Uint8Array {
  return concatProtobufFields(
    ...(pose ? [pointCloudPoseField(pose)] : []),
    protobufFixed32Field(4, pointStride),
    ...fields.map((field) => packedPointCloudField(field)),
    protobufBytesField(6, data),
  );
}

export function pointCloudPoseField({
  orientation,
  position,
}: TestPointCloudPose): Uint8Array {
  const fields: Uint8Array[] = [];
  if (position) {
    fields.push(
      protobufBytesField(
        1,
        concatProtobufFields(
          ...(position.x !== undefined
            ? [protobufDoubleField(1, position.x)]
            : []),
          ...(position.y !== undefined
            ? [protobufDoubleField(2, position.y)]
            : []),
          ...(position.z !== undefined
            ? [protobufDoubleField(3, position.z)]
            : []),
        ),
      ),
    );
  }
  if (orientation) {
    fields.push(
      protobufBytesField(
        2,
        concatProtobufFields(
          ...(orientation.x !== undefined
            ? [protobufDoubleField(1, orientation.x)]
            : []),
          ...(orientation.y !== undefined
            ? [protobufDoubleField(2, orientation.y)]
            : []),
          ...(orientation.z !== undefined
            ? [protobufDoubleField(3, orientation.z)]
            : []),
          ...(orientation.w !== undefined
            ? [protobufDoubleField(4, orientation.w)]
            : []),
        ),
      ),
    );
  }

  return protobufBytesField(3, concatProtobufFields(...fields));
}

export function packedPointCloudField({
  name,
  offset,
  type,
}: TestPointCloudField): Uint8Array {
  return protobufBytesField(
    5,
    concatProtobufFields(
      protobufBytesField(1, new TextEncoder().encode(name)),
      protobufFixed32Field(2, offset),
      protobufVarintField(3, type),
    ),
  );
}

// foxglove.Grid field numbers: frame_id=2, pose=3, column_count=4,
// cell_size=5, row_stride=6, cell_stride=7, fields=8, data=9.
export function gridWireMessage({
  cellStride,
  columnCount,
  data,
  fields,
  rowStride,
}: {
  readonly cellStride: number;
  readonly columnCount: number;
  readonly data: Uint8Array;
  readonly fields: readonly TestPointCloudField[];
  readonly rowStride: number;
}): Uint8Array {
  return concatProtobufFields(
    protobufBytesField(2, new TextEncoder().encode("map")),
    protobufBytesField(
      3,
      protobufBytesField(
        1,
        concatProtobufFields(
          protobufDoubleField(1, 920),
          protobufDoubleField(2, 1300),
          protobufDoubleField(3, 0.5),
        ),
      ),
    ),
    protobufFixed32Field(4, columnCount),
    protobufBytesField(
      5,
      concatProtobufFields(
        protobufDoubleField(1, 0.1),
        protobufDoubleField(2, 0.1),
      ),
    ),
    protobufFixed32Field(6, rowStride),
    protobufFixed32Field(7, cellStride),
    ...fields.map((field) =>
      protobufBytesField(
        8,
        concatProtobufFields(
          protobufBytesField(1, new TextEncoder().encode(field.name)),
          protobufFixed32Field(2, field.offset),
          protobufVarintField(3, field.type),
        ),
      ),
    ),
    protobufBytesField(9, data),
  );
}

export function radarPointBytes(): Uint8Array {
  const pointStride = 19;
  const data = new Uint8Array(pointStride * 2);
  const view = new DataView(data.buffer);

  writeRadarPoint(view, 0, {
    b: 0,
    g: 0,
    r: 255,
    rcs: 10,
    x: 1,
    y: 2,
    z: 3,
  });
  writeRadarPoint(view, pointStride, {
    b: 255,
    g: 128,
    r: 0,
    rcs: 20,
    x: 4,
    y: 5,
    z: 6,
  });

  return data;
}

export function writeRadarPoint(
  view: DataView,
  offset: number,
  point: {
    readonly b: number;
    readonly g: number;
    readonly r: number;
    readonly rcs: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  },
) {
  view.setFloat32(offset, point.x, true);
  view.setFloat32(offset + 4, point.y, true);
  view.setFloat32(offset + 8, point.z, true);
  view.setFloat32(offset + 12, point.rcs, true);
  view.setUint8(offset + 16, point.r);
  view.setUint8(offset + 17, point.g);
  view.setUint8(offset + 18, point.b);
}

export function expectArrayCloseTo(
  actual: readonly number[],
  expected: readonly number[],
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]);
  });
}

export function protobufFixed32Field(
  fieldNumber: number,
  value: number,
): Uint8Array {
  const bytes = new Uint8Array(5);
  bytes[0] = (fieldNumber << 3) | 5;
  new DataView(bytes.buffer).setUint32(1, value, true);

  return bytes;
}

export function protobufDoubleField(
  fieldNumber: number,
  value: number,
): Uint8Array {
  const bytes = new Uint8Array(9);
  bytes[0] = (fieldNumber << 3) | 1;
  new DataView(bytes.buffer).setFloat64(1, value, true);

  return bytes;
}

export function protobufVarintField(
  fieldNumber: number,
  value: number,
): Uint8Array {
  return concatProtobufFields(Uint8Array.of(fieldNumber << 3), varint(value));
}

export function protobufBytesField(
  fieldNumber: number,
  value: Uint8Array,
): Uint8Array {
  return concatProtobufFields(
    Uint8Array.of((fieldNumber << 3) | 2),
    varint(value.byteLength),
    value,
  );
}

export function varint(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining);

  return Uint8Array.from(bytes);
}

export function float32Bytes(values: readonly number[]): Uint8Array {
  const data = new Uint8Array(values.length * 4);
  const view = new DataView(data.buffer);

  values.forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });

  return data;
}

export function float64Bytes(values: readonly number[]): Uint8Array {
  const data = new Uint8Array(values.length * 8);
  const view = new DataView(data.buffer);

  values.forEach((value, index) => {
    view.setFloat64(index * 8, value, true);
  });

  return data;
}

export function concatProtobufFields(
  ...fields: readonly Uint8Array[]
): Uint8Array {
  const length = fields.reduce((size, field) => size + field.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const field of fields) {
    result.set(field, offset);
    offset += field.byteLength;
  }

  return result;
}

export const COMPRESSED_VIDEO_ROOT = Root.fromJSON({
  nested: {
    foxglove: {
      nested: {
        CompressedVideo: {
          fields: {
            data: { id: 3, type: "bytes" },
            format: { id: 4, type: "string" },
            frameId: { id: 2, type: "string" },
            timestamp: { id: 1, type: "google.protobuf.Timestamp" },
          },
        },
      },
    },
    google: {
      nested: {
        protobuf: {
          nested: {
            Timestamp: {
              fields: {
                nanos: { id: 2, type: "int32" },
                seconds: { id: 1, type: "int64" },
              },
            },
          },
        },
      },
    },
  },
});

export const COMPRESSED_VIDEO_SCHEMA_DATA = protobufDescriptorData(
  COMPRESSED_VIDEO_ROOT,
);

export const RAW_IMAGE_ROOT = Root.fromJSON({
  nested: {
    foxglove: {
      nested: {
        RawImage: {
          fields: {
            data: { id: 6, type: "bytes" },
            encoding: { id: 4, type: "string" },
            frameId: { id: 7, type: "string" },
            height: { id: 3, type: "fixed32" },
            step: { id: 5, type: "fixed32" },
            timestamp: { id: 1, type: "google.protobuf.Timestamp" },
            width: { id: 2, type: "fixed32" },
          },
        },
      },
    },
    google: {
      nested: {
        protobuf: {
          nested: {
            Timestamp: {
              fields: {
                nanos: { id: 2, type: "int32" },
                seconds: { id: 1, type: "int64" },
              },
            },
          },
        },
      },
    },
  },
});

export const RAW_IMAGE_SCHEMA_DATA = protobufDescriptorData(RAW_IMAGE_ROOT);

export function rawImageWireMessage(): Uint8Array {
  return concatProtobufFields(
    protobufBytesField(
      1,
      concatProtobufFields(
        protobufVarintField(1, 12),
        protobufVarintField(2, 34),
      ),
    ),
    protobufFixed32Field(2, 2),
    protobufFixed32Field(3, 1),
    protobufBytesField(4, new TextEncoder().encode("rgb8")),
    protobufFixed32Field(5, 6),
    protobufBytesField(6, Uint8Array.of(255, 0, 0, 0, 255, 0)),
    protobufBytesField(7, new TextEncoder().encode("CAM_RAW")),
  );
}

export const ROS2_RAW_IMAGE_SCHEMA = `builtin_interfaces/Time timestamp
string frame_id
uint32 width
uint32 height
string encoding
uint32 step
uint8[] data
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

export const ROS2_COMPRESSED_IMAGE_SCHEMA = `builtin_interfaces/Time timestamp
string frame_id
uint8[] data
string format
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

export const ROS2_COMPRESSED_VIDEO_SCHEMA = `builtin_interfaces/Time timestamp
string frame_id
uint8[] data
string format
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

export const ROS2_IDL_COMPRESSED_VIDEO_SCHEMA = `
module foxglove_msgs {
  module msg {
    struct CompressedVideo {
      builtin_interfaces::msg::Time timestamp;
      string frame_id;
      sequence<octet> data;
      string format;
    };
  };
};

module builtin_interfaces {
  module msg {
    struct Time {
      int32 sec;
      uint32 nanosec;
    };
  };
};
`;

export const ROS2_SCENE_UPDATE_SCHEMA = `foxglove_msgs/SceneEntityDeletion[] deletions
foxglove_msgs/SceneEntity[] entities
================================================================================
MSG: foxglove_msgs/SceneEntityDeletion
builtin_interfaces/Time timestamp
string id
uint8 type
================================================================================
MSG: foxglove_msgs/SceneEntity
builtin_interfaces/Time timestamp
string frame_id
string id
bool frame_locked
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

export const ROS2_LOG_SCHEMA = `builtin_interfaces/Time timestamp
uint8 level
string message
string name
string file
uint32 line
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

export const LOG_ROOT = Root.fromJSON({
  nested: {
    foxglove: {
      nested: {
        Log: {
          fields: {
            file: { id: 5, type: "string" },
            level: { id: 2, type: "uint32" },
            line: { id: 6, type: "uint32" },
            message: { id: 3, type: "string" },
            name: { id: 4, type: "string" },
            timestamp: { id: 1, type: "google.protobuf.Timestamp" },
          },
        },
      },
    },
    google: {
      nested: {
        protobuf: {
          nested: {
            Timestamp: {
              fields: {
                nanos: { id: 2, type: "int32" },
                seconds: { id: 1, type: "int64" },
              },
            },
          },
        },
      },
    },
  },
});

export const LOG_SCHEMA_DATA = protobufDescriptorData(LOG_ROOT);

export function decoderForSchemaEncoding(
  decoders: readonly Decoder[],
  schemaEncoding: string,
): Decoder {
  const decoder = decoders.find(
    (candidate) => candidate.payload.schemaEncoding === schemaEncoding,
  );
  if (!decoder) {
    throw new Error(`Missing decoder for ${schemaEncoding}`);
  }

  return decoder;
}

export function schemaData(schema: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(schema));
}

export function ros2Message(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(schema, { ros2: true }),
  );
  return writer.writeMessage(record);
}

export function ros2IdlMessage(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(parseRos2idl(schema));
  return writer.writeMessage(record);
}

export function protobufDescriptorData(root: Root): Uint8Array {
  return new Uint8Array(
    descriptor.FileDescriptorSet.encode(
      (
        root as unknown as {
          toDescriptor(
            version: string,
          ): Parameters<typeof descriptor.FileDescriptorSet.encode>[0];
        }
      ).toDescriptor("proto3"),
    ).finish(),
  );
}

export function createTopic(
  topic: string,
  payload: PayloadDescriptor,
): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    displayName: topic,
    metadata: {
      "mcap.schema_name": payload.schema ?? "",
      "mcap.topic": topic,
    },
    payload: {
      $typeName: "fiftyone.multimodal.schemas.v1.PayloadDescriptor",
      encoding: payload.encoding,
      schema: payload.schema,
      schemaEncoding: payload.schemaEncoding,
    },
    streamId: topic,
  };
}
