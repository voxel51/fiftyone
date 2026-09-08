import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import {
  foxgloveCompressedVideoCdrDecoders,
  foxgloveCompressedVideoDecoder,
} from "./foxglove/index";
import {
  COMPRESSED_VIDEO_SCHEMA_DATA,
  H264_KEYFRAME_BYTES,
  ROS2_COMPRESSED_VIDEO_SCHEMA,
  ROS2_IDL_COMPRESSED_VIDEO_SCHEMA,
  compressedVideoMessage,
  decoderForSchemaEncoding,
  ros2IdlMessage,
  ros2Message,
  schemaData,
} from "./foxglove.test-helpers";

describe("Foxglove compressed-video decoders", () => {
  it("decodes protobuf compressed video messages into encoded video", () => {
    const output = foxgloveCompressedVideoDecoder.decode(
      compressedVideoMessage("avc1.4D001F"),
      {
        schemaData: COMPRESSED_VIDEO_SCHEMA_DATA,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/camera/video",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_VIDEO);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_VIDEO) {
      throw new Error("Expected encoded video visualization");
    }
    expect(output.visualization).toMatchObject({
      codec: "h264",
      coordinateFrameId: "CAM_VIDEO",
      format: "avc1.4D001F",
      keyframe: true,
      timestampNs: 123456000000000n,
    });
    expect(output.visualization.h264).toMatchObject({
      codecString: "avc1.4d001f",
      hasFrame: true,
    });
    expect(output.attributes).toMatchObject({
      byteLength: H264_KEYFRAME_BYTES.byteLength,
      codec: "h264",
      codecString: "avc1.4d001f",
      format: "avc1.4D001F",
      frameId: "CAM_VIDEO",
      keyframe: true,
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(123456000000000n);
  });

  it("decodes cdr compressed video H.264 messages into encoded video", () => {
    const output = decoderForSchemaEncoding(
      foxgloveCompressedVideoCdrDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_COMPRESSED_VIDEO_SCHEMA, {
        data: Array.from(H264_KEYFRAME_BYTES),
        format: "h264",
        frame_id: "CAM_VIDEO",
        timestamp: { nanosec: 4, sec: 3 },
      }),
      { schemaData: schemaData(ROS2_COMPRESSED_VIDEO_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_VIDEO);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_VIDEO) {
      throw new Error("Expected encoded video visualization");
    }
    expect(output.visualization).toMatchObject({
      codec: "h264",
      coordinateFrameId: "CAM_VIDEO",
      keyframe: true,
      timestampNs: 3_000_000_004n,
    });
    expect(output.attributes).toMatchObject({
      codec: "h264",
      frameId: "CAM_VIDEO",
      keyframe: true,
    });
  });

  it("degrades cdr compressed video messages to metadata-only", () => {
    const output = decoderForSchemaEncoding(
      foxgloveCompressedVideoCdrDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_COMPRESSED_VIDEO_SCHEMA, {
        data: [0, 0, 0, 1, 0x67, 0x4d, 0x0c, 0x33],
        format: "vp9",
        frame_id: "CAM_VIDEO",
        timestamp: { nanosec: 4, sec: 3 },
      }),
      { schemaData: schemaData(ROS2_COMPRESSED_VIDEO_SCHEMA) },
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      byteLength: 8,
      format: "vp9",
      frameId: "CAM_VIDEO",
      unsupportedReason: "VP9 video rendering not yet supported",
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(3_000_000_004n);
  });

  it("reports missing compressed video formats without masking the reason", () => {
    const protobuf = foxgloveCompressedVideoDecoder.decode(
      compressedVideoMessage(),
      {
        schemaData: COMPRESSED_VIDEO_SCHEMA_DATA,
      },
    );
    const cdr = decoderForSchemaEncoding(
      foxgloveCompressedVideoCdrDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_COMPRESSED_VIDEO_SCHEMA, {
        data: Array.from(H264_KEYFRAME_BYTES),
        frame_id: "CAM_VIDEO",
        timestamp: { nanosec: 4, sec: 3 },
      }),
      { schemaData: schemaData(ROS2_COMPRESSED_VIDEO_SCHEMA) },
    );

    expect(protobuf.visualization).toBeUndefined();
    expect(protobuf.attributes).toMatchObject({
      format: "unknown",
      unsupportedReason: "Foxglove CompressedVideo format is missing",
    });
    expect(cdr.visualization).toBeUndefined();
    expect(cdr.attributes).toMatchObject({
      format: "unknown",
      unsupportedReason: "Foxglove CompressedVideo format is missing",
    });
  });

  it("registers compressed video cdr payloads for both ROS 2 schema spellings", () => {
    const output = decoderForSchemaEncoding(
      foxgloveCompressedVideoCdrDecoders,
      "ros2idl",
    ).decode(
      ros2IdlMessage(ROS2_IDL_COMPRESSED_VIDEO_SCHEMA, {
        data: [1, 2, 3],
        format: "av1",
        frame_id: "CAM_IDL",
        // @foxglove/ros2idl-parser exposes builtin_interfaces/Time as nsec.
        timestamp: { nsec: 6, sec: 5 },
      }),
      { schemaData: schemaData(ROS2_IDL_COMPRESSED_VIDEO_SCHEMA) },
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      byteLength: 3,
      format: "av1",
      frameId: "CAM_IDL",
      unsupportedReason: "AV1 video rendering not yet supported",
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(5_000_000_006n);
  });
});
