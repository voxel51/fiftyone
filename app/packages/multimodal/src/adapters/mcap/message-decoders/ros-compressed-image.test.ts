import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { rosCompressedImageDecoders } from "./ros/index";
import {
  H264_KEYFRAME_BYTES,
  ROS2_COMPRESSED_IMAGE_SCHEMA,
  ROS2_IDL_COMPRESSED_IMAGE_SCHEMA,
  TEXT_ENCODER,
  decoderForSchemaEncoding,
  ros2IdlMessage,
  ros2Message,
  schemaData,
} from "./ros.test-helpers";

describe("ROS compressed-image decoders", () => {
  it("decodes ros2 idl CompressedImage into an encoded image visualization", () => {
    const output = decoderForSchemaEncoding(
      rosCompressedImageDecoders,
      "ros2idl",
    ).decode(
      ros2IdlMessage(ROS2_IDL_COMPRESSED_IMAGE_SCHEMA, {
        data: Array.from(TEXT_ENCODER.encode("fake-jpeg")),
        format: "jpeg",
        header: {
          frame_id: "camera",
          stamp: { nsec: 4, sec: 3 },
        },
      }),
      { schemaData: schemaData(ROS2_IDL_COMPRESSED_IMAGE_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE) {
      throw new Error("Expected encoded image visualization");
    }
    expect(new TextDecoder().decode(output.visualization.bytes)).toBe(
      "fake-jpeg",
    );
    expect(output.visualization.mimeType).toBe("image/jpeg");
    expect(output.attributes).toMatchObject({
      byteLength: 9,
      format: "jpeg",
      frameId: "camera",
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(3_000_000_004n);
  });

  it("decodes ROS CompressedImage H.264 into encoded video", () => {
    const output = decoderForSchemaEncoding(
      rosCompressedImageDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_COMPRESSED_IMAGE_SCHEMA, {
        data: Array.from(H264_KEYFRAME_BYTES),
        format: "bgr8; h264 compressed",
        header: {
          frame_id: "camera",
          stamp: { nanosec: 4, sec: 3 },
        },
      }),
      { schemaData: schemaData(ROS2_COMPRESSED_IMAGE_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_VIDEO);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_VIDEO) {
      throw new Error("Expected encoded video visualization");
    }
    expect(output.visualization).toMatchObject({
      codec: "h264",
      coordinateFrameId: "camera",
      format: "bgr8; h264 compressed",
      keyframe: true,
      timestampNs: 3_000_000_004n,
    });
    expect(output.visualization.h264).toMatchObject({
      codecString: "avc1.4d001f",
      hasFrame: true,
    });
    expect(output.attributes).toMatchObject({
      byteLength: H264_KEYFRAME_BYTES.byteLength,
      codec: "h264",
      codecString: "avc1.4d001f",
      format: "bgr8; h264 compressed",
      frameId: "camera",
      keyframe: true,
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(3_000_000_004n);
  });

  it("degrades ROS CompressedImage B-frame H.264 without throwing", () => {
    const output = decoderForSchemaEncoding(
      rosCompressedImageDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_COMPRESSED_IMAGE_SCHEMA, {
        data: [0, 0, 1, 0x41, 0xa0],
        format: "h264",
        header: {
          frame_id: "camera",
          stamp: { nanosec: 4, sec: 3 },
        },
      }),
      { schemaData: schemaData(ROS2_COMPRESSED_IMAGE_SCHEMA) },
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      byteLength: 5,
      format: "h264",
      frameId: "camera",
      unsupportedReason: "H.264 video streams with B-frames are unsupported",
    });
  });

  it("degrades ROS CompressedImage non-H.264 video formats", () => {
    const output = decoderForSchemaEncoding(
      rosCompressedImageDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_COMPRESSED_IMAGE_SCHEMA, {
        data: [1, 2, 3],
        format: "vp9",
        header: {
          frame_id: "camera",
          stamp: { nanosec: 4, sec: 3 },
        },
      }),
      { schemaData: schemaData(ROS2_COMPRESSED_IMAGE_SCHEMA) },
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      byteLength: 3,
      format: "vp9",
      frameId: "camera",
      unsupportedReason: "VP9 video rendering not yet supported",
    });
  });

  it("degrades ROS CompressedImage H.264 without Annex-B start codes", () => {
    const output = decoderForSchemaEncoding(
      rosCompressedImageDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_COMPRESSED_IMAGE_SCHEMA, {
        data: [0x65, 0xb0],
        format: "h264",
        header: {
          frame_id: "camera",
          stamp: { nanosec: 4, sec: 3 },
        },
      }),
      { schemaData: schemaData(ROS2_COMPRESSED_IMAGE_SCHEMA) },
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      byteLength: 2,
      format: "h264",
      frameId: "camera",
      unsupportedReason: "H.264 video requires Annex-B NAL start codes",
    });
  });

  it("degrades ROS CompressedImage H.264 parameter sets without frame NALs", () => {
    const output = decoderForSchemaEncoding(
      rosCompressedImageDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_COMPRESSED_IMAGE_SCHEMA, {
        data: [0, 0, 0, 1, 0x67, 0x4d, 0x00, 0x1f, 0, 0, 1, 0x68, 0xce],
        format: "h264",
        header: {
          frame_id: "camera",
          stamp: { nanosec: 4, sec: 3 },
        },
      }),
      { schemaData: schemaData(ROS2_COMPRESSED_IMAGE_SCHEMA) },
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      byteLength: 13,
      format: "h264",
      frameId: "camera",
      unsupportedReason: "H.264 video requires frame NAL units",
    });
  });
});
