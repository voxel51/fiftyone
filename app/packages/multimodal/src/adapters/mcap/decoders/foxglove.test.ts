import { parse as parseRosMessageDefinition } from "@foxglove/rosmsg";
import { parseRos2idl } from "@foxglove/ros2idl-parser";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import { describe, expect, it } from "vitest";
import type { Decoder, PayloadDescriptor } from "../../../decoders";
import type { StreamInventory } from "../../../schemas/v1";
import { VISUALIZATION_KIND } from "../../../ir";
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
} from "../stream-topics";
import { createMcapDecoderRegistry } from ".";
import {
  FOXGLOVE_CAMERA_CALIBRATION_CDR_PAYLOADS,
  FOXGLOVE_COMPRESSED_IMAGE_CDR_PAYLOADS,
  FOXGLOVE_GRID_CDR_PAYLOADS,
  FOXGLOVE_IMAGE_ANNOTATIONS_CDR_PAYLOADS,
  FOXGLOVE_LASER_SCAN_CDR_PAYLOADS,
  FOXGLOVE_LOCATION_FIX_CDR_PAYLOADS,
  FOXGLOVE_LOG_CDR_PAYLOADS,
  FOXGLOVE_POINT_CLOUD_CDR_PAYLOADS,
  FOXGLOVE_POSE_IN_FRAME_CDR_PAYLOADS,
  FOXGLOVE_SCENE_UPDATE_CDR_PAYLOADS,
  foxgloveCameraCalibrationCdrDecoders,
  foxgloveCameraCalibrationDecoder,
  foxgloveCompressedImageCdrDecoders,
  foxgloveCompressedImageDecoder,
  foxgloveCompressedVideoCdrDecoders,
  foxgloveCompressedVideoDecoder,
  foxgloveGridCdrDecoders,
  foxgloveGridDecoder,
  foxgloveImageAnnotationsCdrDecoders,
  foxgloveImageAnnotationsDecoder,
  foxgloveLaserScanCdrDecoders,
  foxgloveLaserScanDecoder,
  foxgloveLocationFixCdrDecoders,
  foxgloveLocationFixDecoder,
  foxgloveLogCdrDecoders,
  foxgloveLogDecoder,
  foxglovePointCloudCdrDecoders,
  foxglovePointCloudDecoder,
  foxglovePoseInFrameCdrDecoders,
  foxglovePoseInFrameDecoder,
  foxgloveRawImageCdrDecoders,
  foxgloveRawImageDecoder,
  foxgloveSceneUpdateCdrDecoders,
  foxgloveSceneUpdateDecoder,
} from "./foxglove";
import { jsonPoseDecoder } from "./json";
import { optionalBigInt } from "./foxglove/protobuf/records";
import {
  CAMERA_CALIBRATION_FIXTURE,
  COMPRESSED_IMAGE_FIXTURE,
  GRID_FIXTURE,
  LASER_SCAN_FIXTURE,
  POINT_CLOUD_FIXTURE,
  POSE_IN_FRAME_FIXTURE,
} from "./foxglove.test-fixtures";

describe("Foxglove decoders", () => {
  it("registers with the MCAP decoder registry", () => {
    const registry = createMcapDecoderRegistry();

    expect(registry.find(foxgloveCompressedImageDecoder.payload)).toBe(
      foxgloveCompressedImageDecoder,
    );
    for (const decoder of foxgloveCompressedImageCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxgloveCompressedVideoDecoder.payload)).toBe(
      foxgloveCompressedVideoDecoder,
    );
    for (const decoder of foxgloveCompressedVideoCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxgloveRawImageDecoder.payload)).toBe(
      foxgloveRawImageDecoder,
    );
    for (const decoder of foxgloveRawImageCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxglovePointCloudDecoder.payload)).toBe(
      foxglovePointCloudDecoder,
    );
    for (const decoder of foxglovePointCloudCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxgloveLaserScanDecoder.payload)).toBe(
      foxgloveLaserScanDecoder,
    );
    for (const decoder of foxgloveLaserScanCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxgloveSceneUpdateDecoder.payload)).toBe(
      foxgloveSceneUpdateDecoder,
    );
    for (const decoder of foxgloveSceneUpdateCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxgloveGridDecoder.payload)).toBe(
      foxgloveGridDecoder,
    );
    for (const decoder of foxgloveGridCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxgloveCameraCalibrationDecoder.payload)).toBe(
      foxgloveCameraCalibrationDecoder,
    );
    for (const decoder of foxgloveCameraCalibrationCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxglovePoseInFrameDecoder.payload)).toBe(
      foxglovePoseInFrameDecoder,
    );
    for (const decoder of foxglovePoseInFrameCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(jsonPoseDecoder.payload)).toBe(jsonPoseDecoder);
    expect(registry.find(foxgloveLocationFixDecoder.payload)).toBe(
      foxgloveLocationFixDecoder,
    );
    for (const decoder of foxgloveLocationFixCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxgloveLogDecoder.payload)).toBe(foxgloveLogDecoder);
    for (const decoder of foxgloveLogCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    for (const decoder of foxgloveImageAnnotationsCdrDecoders) {
      expect(registry.find(decoder.payload)).toBe(decoder);
    }
    expect(registry.find(foxgloveImageAnnotationsDecoder.payload)).toBe(
      foxgloveImageAnnotationsDecoder,
    );
  });

  it("decodes protobuf camera calibration payloads", () => {
    // foxglove.CameraCalibration field numbers: width=2, height=3,
    // distortion_model=4, D=5, K=6, R=7, P=8, frame_id=9.
    const output = foxgloveCameraCalibrationDecoder.decode(
      concatProtobufFields(
        protobufFixed32Field(2, 1600),
        protobufFixed32Field(3, 900),
        ...[1252.8, 0, 826.6, 0, 1252.8, 469.9, 0, 0, 1].map((value) =>
          protobufDoubleField(6, value),
        ),
        protobufBytesField(9, new TextEncoder().encode("CAM_FRONT")),
      ),
      {
        schemaData: CAMERA_CALIBRATION_FIXTURE.schemaData,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/CAM_FRONT/camera_info",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(
      VISUALIZATION_KIND.CAMERA_CALIBRATION,
    );
    if (output.visualization?.kind !== VISUALIZATION_KIND.CAMERA_CALIBRATION) {
      throw new Error("Expected camera calibration visualization");
    }
    expect(output.visualization).toMatchObject({
      coordinateFrameId: "CAM_FRONT",
      height: 900,
      width: 1600,
    });
    expect(output.visualization.K).toEqual([
      1252.8, 0, 826.6, 0, 1252.8, 469.9, 0, 0, 1,
    ]);
    expect(output.visualization.R).toBeUndefined();
    expect(output.timing?.timeRange?.startNs).toBe(10n);
  });

  it("decodes compressed image payloads into encoded image visualizations", () => {
    const output = foxgloveCompressedImageDecoder.decode(
      COMPRESSED_IMAGE_FIXTURE.message,
      {
        schemaData: COMPRESSED_IMAGE_FIXTURE.schemaData,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/camera",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE) {
      throw new Error("Expected encoded image visualization");
    }
    expect(text(output.visualization.bytes)).toBe("fake-jpeg");
    expect(output.visualization.mimeType).toBe("image/jpeg");
    expect(output.attributes).toMatchObject({
      byteLength: 9,
      format: "jpeg",
      frameId: "CAM_TEST",
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(123456000000n);
  });

  it("decodes cdr compressed image messages with Foxglove ROS2 schemas", () => {
    const output = decoderForSchemaEncoding(
      foxgloveCompressedImageCdrDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_COMPRESSED_IMAGE_SCHEMA, {
        data: Array.from(new TextEncoder().encode("fake-png")),
        format: "png",
        frame_id: "CAM_CDR",
        timestamp: { nanosec: 4, sec: 3 },
      }),
      { schemaData: schemaData(ROS2_COMPRESSED_IMAGE_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE) {
      throw new Error("Expected encoded image visualization");
    }
    expect(text(output.visualization.bytes)).toBe("fake-png");
    expect(output.visualization.mimeType).toBe("image/png");
    expect(output.attributes).toMatchObject({
      byteLength: 8,
      format: "png",
      frameId: "CAM_CDR",
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(3_000_000_004n);
  });

  it("normalizes uppercase compressed image MIME formats", () => {
    const output = foxgloveCompressedImageDecoder.decode(
      compressedImageMessage("IMAGE/JPEG"),
      {
        schemaData: COMPRESSED_IMAGE_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE) {
      throw new Error("Expected encoded image visualization");
    }
    expect(output.visualization.mimeType).toBe("image/jpeg");
  });

  it("keeps compressed image video formats metadata-only", () => {
    const output = foxgloveCompressedImageDecoder.decode(
      compressedImageMessage("h264"),
      {
        schemaData: COMPRESSED_IMAGE_FIXTURE.schemaData,
      },
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      byteLength: 9,
      format: "h264",
      unsupportedReason:
        "Foxglove CompressedImage format 'h264' is unsupported",
    });
  });

  it("reports non-H.264 compressed image video formats with video reasons", () => {
    const output = foxgloveCompressedImageDecoder.decode(
      compressedImageMessage("vp9"),
      {
        schemaData: COMPRESSED_IMAGE_FIXTURE.schemaData,
      },
    );

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      byteLength: 9,
      format: "vp9",
      unsupportedReason: "VP9 video rendering not yet supported",
    });
  });

  it("keeps compressed images with missing formats previewable", () => {
    const output = foxgloveCompressedImageDecoder.decode(
      compressedImageMessage(),
      {
        schemaData: COMPRESSED_IMAGE_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE) {
      throw new Error("Expected encoded image visualization");
    }
    expect(output.visualization.mimeType).toBeUndefined();
    expect(output.attributes).toMatchObject({
      byteLength: 9,
      format: "unknown",
    });
    expect(output.attributes?.unsupportedReason).toBeUndefined();
  });

  it("normalizes whitespace and unknown compressed image formats", () => {
    const jpeg = foxgloveCompressedImageDecoder.decode(
      compressedImageMessage(" JPG "),
      {
        schemaData: COMPRESSED_IMAGE_FIXTURE.schemaData,
      },
    );
    const unknown = foxgloveCompressedImageDecoder.decode(
      compressedImageMessage(" UNKNOWN "),
      {
        schemaData: COMPRESSED_IMAGE_FIXTURE.schemaData,
      },
    );

    if (
      jpeg.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE ||
      unknown.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE
    ) {
      throw new Error("Expected encoded image visualizations");
    }
    expect(jpeg.visualization.mimeType).toBe("image/jpeg");
    expect(unknown.visualization.mimeType).toBeUndefined();
  });

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

  it("decodes protobuf raw image wire messages into raw RGBA", () => {
    const output = foxgloveRawImageDecoder.decode(rawImageWireMessage(), {
      schemaData: RAW_IMAGE_SCHEMA_DATA,
    });

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.RAW_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
      throw new Error("Expected raw image visualization");
    }
    expect(output.visualization).toMatchObject({
      coordinateFrameId: "CAM_RAW",
      height: 1,
      sourceEncoding: "rgb8",
      timestampNs: 12_000_000_034n,
      width: 2,
    });
    expect(Array.from(output.visualization.rgba)).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255,
    ]);
    expect(output.attributes).toMatchObject({
      byteLength: 6,
      encoding: "rgb8",
      frameId: "CAM_RAW",
      height: 1,
      step: 6,
      width: 2,
    });
  });

  it("decodes cdr raw image messages into raw RGBA", () => {
    const output = decoderForSchemaEncoding(
      foxgloveRawImageCdrDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_RAW_IMAGE_SCHEMA, {
        data: [0, 0, 255, 0, 255, 0],
        encoding: "bgr8",
        frame_id: "CAM_RAW",
        height: 1,
        step: 6,
        timestamp: { nanosec: 4, sec: 3 },
        width: 2,
      }),
      { schemaData: schemaData(ROS2_RAW_IMAGE_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.RAW_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
      throw new Error("Expected raw image visualization");
    }
    expect(output.visualization).toMatchObject({
      coordinateFrameId: "CAM_RAW",
      sourceEncoding: "bgr8",
      timestampNs: 3_000_000_004n,
    });
    expect(Array.from(output.visualization.rgba)).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255,
    ]);
  });

  it("treats invalid optional bigint protobuf fields as absent", () => {
    expect(optionalBigInt({ seconds: "not-a-number" }, "seconds")).toBe(
      undefined,
    );
    expect(
      optionalBigInt(
        { seconds: { toString: () => "also-not-a-number" } },
        "seconds",
      ),
    ).toBe(undefined);
  });

  it("decodes point cloud payloads into point cloud visualizations", () => {
    const output = foxglovePointCloudDecoder.decode(
      POINT_CLOUD_FIXTURE.message,
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/lidar",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(output.visualization.coordinateFrameId).toBe("LIDAR_TEST");
    expect(output.visualization.pointCount).toBe(2);
    expect(output.attributes).toMatchObject({
      frameId: "LIDAR_TEST",
      pointCount: 2,
      pointStride: 12,
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(123456000001n);
  });

  it("decodes laser scan payloads into point cloud visualizations", () => {
    // foxglove.LaserScan field numbers: timestamp=1, frame_id=2, pose=3,
    // start_angle=4, end_angle=5, ranges=6, intensities=7. Two returns
    // sweeping 0..90° from a scanner at (1, 1, 0) with identity orientation.
    const output = foxgloveLaserScanDecoder.decode(
      concatProtobufFields(
        protobufBytesField(
          1,
          concatProtobufFields(
            protobufVarintField(1, 12),
            protobufVarintField(2, 34),
          ),
        ),
        protobufBytesField(2, new TextEncoder().encode("SCAN_TEST")),
        protobufBytesField(
          3,
          protobufBytesField(
            1,
            concatProtobufFields(
              protobufDoubleField(1, 1),
              protobufDoubleField(2, 1),
            ),
          ),
        ),
        protobufDoubleField(4, 0),
        protobufDoubleField(5, Math.PI / 2),
        protobufBytesField(6, float64Bytes([1, 2])),
        protobufBytesField(7, float64Bytes([10, 20])),
      ),
      {
        schemaData: LASER_SCAN_FIXTURE.schemaData,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/scan",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(output.visualization.coordinateFrameId).toBe("SCAN_TEST");
    expect(output.visualization.pointCount).toBe(2);
    expectArrayCloseTo(
      Array.from(output.visualization.positions),
      [2, 1, 0, 1, 3, 0],
    );
    expect(output.visualization.scalarFields?.[0]?.name).toBe("intensity");
    expect(
      Array.from(output.visualization.scalarFields?.[0]?.values ?? []),
    ).toEqual([10, 20]);
    expect(output.attributes).toMatchObject({
      endAngle: Math.PI / 2,
      frameId: "SCAN_TEST",
      pointCount: 2,
      rangeCount: 2,
      startAngle: 0,
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("decodes point cloud colors and canonical scalar fields", () => {
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(radarPointBytes(), {
        fields: [
          { name: "x", offset: 0, type: 7 },
          { name: "y", offset: 4, type: 7 },
          { name: "z", offset: 8, type: 7 },
          { name: "rcs", offset: 12, type: 7 },
          { name: "r", offset: 16, type: 1 },
          { name: "g", offset: 17, type: 1 },
          { name: "b", offset: 18, type: 1 },
        ],
        pointStride: 19,
      }),
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }

    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expectArrayCloseTo(Array.from(output.visualization.colors ?? []), [
      1,
      0,
      0,
      0,
      128 / 255,
      1,
    ]);
    expect(output.visualization.scalarFields?.[0]?.name).toBe("rcs");
    expect(
      Array.from(output.visualization.scalarFields?.[0]?.values ?? []),
    ).toEqual([10, 20]);
    const renderPayload = output.visualization.renderPayload;
    if (!renderPayload) {
      throw new Error("Expected point cloud render payload");
    }
    if (!renderPayload.colors) {
      throw new Error("Expected sampled point cloud colors");
    }
    expect(renderPayload).toMatchObject({
      bounds: { max: [4, 5, 6], min: [1, 2, 3] },
      capacity: 1_024,
      finitePointCount: 2,
      heightRange: { max: 6, min: 3 },
      sampledPointCount: 2,
    });
    expect(Array.from(renderPayload.positions.slice(0, 6))).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(Array.from(renderPayload.sourceIndices.slice(0, 2))).toEqual([0, 1]);
    expect(renderPayload.scalarFields[0]).toMatchObject({
      finiteValueCount: 2,
      name: "rcs",
      range: { max: 20, min: 10 },
    });
    expect(output.resourceHints?.transferables).toEqual(
      expect.arrayContaining([
        renderPayload.positions.buffer,
        renderPayload.colors.buffer,
        renderPayload.sourceIndices.buffer,
        renderPayload.scalarFields[0].values.buffer,
      ]),
    );
  });

  it("decodes strided lidar layouts with trailing scalar fields", () => {
    // x,y,z,intensity float32 records at stride 16 — the common automotive
    // lidar layout (nuScenes /LIDAR_TOP is the stride-20 variant).
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(float32Bytes([1, 2, 3, 0.5, 4, 5, 6, 7.5]), {
        fields: [
          { name: "x", offset: 0, type: 7 },
          { name: "y", offset: 4, type: 7 },
          { name: "z", offset: 8, type: 7 },
          { name: "intensity", offset: 12, type: 7 },
        ],
        pointStride: 16,
      }),
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(output.visualization.scalarFields?.[0]?.name).toBe("intensity");
    expect(
      Array.from(output.visualization.scalarFields?.[0]?.values ?? []),
    ).toEqual([0.5, 7.5]);
    expect(output.visualization.pointCount).toBe(2);
  });

  it("extracts non-canonical numeric channels as scalar fields", () => {
    // Two points: x,y,z, intensity, ring, vx_comp, rgb (all float32).
    // Everything numeric that is neither a position component nor consumed
    // as color must come out as a scalar channel — canonical channels
    // first, the rest in declaration order.
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(
        float32Bytes([1, 2, 3, 0.5, 7, -1.5, 0, 4, 5, 6, 7.5, 8, 2.25, 0]),
        {
          fields: [
            { name: "x", offset: 0, type: 7 },
            { name: "y", offset: 4, type: 7 },
            { name: "z", offset: 8, type: 7 },
            { name: "ring", offset: 16, type: 7 },
            { name: "intensity", offset: 12, type: 7 },
            { name: "vx_comp", offset: 20, type: 7 },
            { name: "rgb", offset: 24, type: 7 },
          ],
          pointStride: 28,
        },
      ),
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(
      output.visualization.scalarFields?.map((field) => field.name),
    ).toEqual(["intensity", "ring", "vx_comp"]);
    expect(
      Array.from(output.visualization.scalarFields?.[1]?.values ?? []),
    ).toEqual([7, 8]);
    expect(
      Array.from(output.visualization.scalarFields?.[2]?.values ?? []),
    ).toEqual([-1.5, 2.25]);
  });

  it("caps scalar channel extraction on exotic layouts", () => {
    const extraFieldCount = 20;
    const fields = [
      { name: "x", offset: 0, type: 7 },
      { name: "y", offset: 4, type: 7 },
      { name: "z", offset: 8, type: 7 },
      ...Array.from({ length: extraFieldCount }, (_, index) => ({
        name: `channel_${index}`,
        offset: 12 + index * 4,
        type: 7,
      })),
    ];
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(
        float32Bytes(Array.from({ length: 3 + extraFieldCount }, () => 1)),
        { fields, pointStride: (3 + extraFieldCount) * 4 },
      ),
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(output.visualization.scalarFields).toHaveLength(16);
    expect(output.visualization.scalarFields?.[0]?.name).toBe("channel_0");
    expect(output.visualization.scalarFields?.[15]?.name).toBe("channel_15");
  });

  it("applies point cloud pose to decoded positions", () => {
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(float32Bytes([1, 0, 0, 0, 2, 3]), {
        pose: {
          orientation: { w: Math.SQRT1_2, z: Math.SQRT1_2 },
          position: { x: 10, y: 20, z: 30 },
        },
      }),
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expectArrayCloseTo(
      Array.from(output.visualization.positions),
      [10, 21, 30, 8, 20, 33],
    );
  });

  it("ignores only unaligned zero padding at the end of point cloud payloads", () => {
    const output = foxglovePointCloudDecoder.decode(
      pointCloudMessage(
        concatProtobufFields(
          float32Bytes([1, 2, 3, 4, 5, 6]),
          new Uint8Array(12),
          new Uint8Array(8),
        ),
      ),
      {
        schemaData: POINT_CLOUD_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6, 0, 0, 0,
    ]);
    expect(output.visualization.pointCount).toBe(3);
  });

  it("decodes protobuf grid payloads into grid visualizations", () => {
    // One 2x1 cell grid packed alpha,blue,green,red per cell — the NuScenes
    // /map channel order — exercising the full protobuf wire path.
    const data = Uint8Array.of(255, 10, 20, 30, 128, 40, 50, 60);
    const output = foxgloveGridDecoder.decode(
      gridWireMessage({
        cellStride: 4,
        columnCount: 2,
        data,
        fields: [
          { name: "alpha", offset: 0, type: 1 },
          { name: "blue", offset: 1, type: 1 },
          { name: "green", offset: 2, type: 1 },
          { name: "red", offset: 3, type: 1 },
        ],
        rowStride: 8,
      }),
      {
        schemaData: GRID_FIXTURE.schemaData,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/map",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.GRID);
    if (output.visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(output.visualization.columnCount).toBe(2);
    expect(output.visualization.rowCount).toBe(1);
    expect(output.visualization.cellSize).toEqual([0.1, 0.1]);
    expect(output.visualization.coordinateFrameId).toBe("map");
    expect(output.visualization.pose.position).toEqual([920, 1300, 0.5]);
    expect(Array.from(output.visualization.rgba)).toEqual([
      30, 20, 10, 255, 60, 50, 40, 128,
    ]);
    expect(output.attributes).toMatchObject({
      colorMode: "color",
      columnCount: 2,
      frameId: "map",
      rowCount: 1,
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
  });

  it("decodes protobuf pose-in-frame payloads", () => {
    // foxglove.PoseInFrame field numbers: frame_id=2, pose=3
    // (foxglove.Pose: position=1, orientation=2; doubles x=1,y=2,z=3,w=4).
    const output = foxglovePoseInFrameDecoder.decode(
      concatProtobufFields(
        protobufBytesField(2, new TextEncoder().encode("map")),
        protobufBytesField(
          3,
          concatProtobufFields(
            protobufBytesField(
              1,
              concatProtobufFields(
                protobufDoubleField(1, 995),
                protobufDoubleField(2, 1375),
                protobufDoubleField(3, 0.5),
              ),
            ),
            protobufBytesField(
              2,
              concatProtobufFields(
                protobufDoubleField(3, 0.707),
                protobufDoubleField(4, 0.707),
              ),
            ),
          ),
        ),
      ),
      {
        schemaData: POSE_IN_FRAME_FIXTURE.schemaData,
        sourceTimestamps: { captureTime: 10n },
        streamId: "/pose",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POSE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POSE) {
      throw new Error("Expected pose visualization");
    }
    expect(output.visualization).toMatchObject({
      coordinateFrameId: "map",
      position: [995, 1375, 0.5],
      quaternion: [0, 0, 0.707, 0.707],
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
  });

  it("decodes cdr scene update messages with Foxglove ROS2 schemas", () => {
    const output = decoderForSchemaEncoding(
      foxgloveSceneUpdateCdrDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_SCENE_UPDATE_SCHEMA, {
        deletions: [],
        entities: [
          {
            frame_id: "map",
            frame_locked: true,
            id: "debug/ego",
            timestamp: { nanosec: 5, sec: 4 },
          },
        ],
      }),
      { schemaData: schemaData(ROS2_SCENE_UPDATE_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) {
      throw new Error("Expected scene update visualization");
    }
    expect(output.visualization.entities).toHaveLength(1);
    expect(output.visualization.entities[0]).toMatchObject({
      frameId: "map",
      frameLocked: true,
      id: "debug/ego",
      timestampNs: 4_000_000_005n,
    });
    expect(output.attributes).toMatchObject({
      deletionCount: 0,
      entityCount: 1,
    });
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(4_000_000_005n);
  });

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

  it("decodes protobuf scalar grid payloads into translucent masks", () => {
    const output = foxgloveGridDecoder.decode(
      gridWireMessage({
        cellStride: 1,
        columnCount: 2,
        data: Uint8Array.of(0, 1),
        fields: [{ name: "drivable_area", offset: 0, type: 1 }],
        rowStride: 2,
      }),
      {
        schemaData: GRID_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.GRID);
    if (output.visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(output.attributes?.colorMode).toBe("scalar");
    expect(Array.from(output.visualization.rgba)).toEqual([
      255, 255, 255, 0, 255, 255, 255, 153,
    ]);
  });

  it("rejects unaligned point cloud payloads with non-zero trailing data", () => {
    expect(() =>
      foxglovePointCloudDecoder.decode(
        pointCloudMessage(
          concatProtobufFields(
            float32Bytes([1, 2, 3, 4, 5, 6]),
            Uint8Array.of(1),
          ),
        ),
        {
          schemaData: POINT_CLOUD_FIXTURE.schemaData,
        },
      ),
    ).toThrow("Point cloud data length is not aligned to point stride");
  });

  it("classifies Foxglove ROS2 CDR streams with the same payload descriptors the registry uses", () => {
    const compressedImage = createTopic(
      "/camera/compressed",
      FOXGLOVE_COMPRESSED_IMAGE_CDR_PAYLOADS[1],
    );
    const pointCloud = createTopic(
      "/points",
      FOXGLOVE_POINT_CLOUD_CDR_PAYLOADS[0],
    );
    const laserScan = createTopic("/scan", FOXGLOVE_LASER_SCAN_CDR_PAYLOADS[0]);
    const annotations = createTopic(
      "/camera/annotations",
      FOXGLOVE_IMAGE_ANNOTATIONS_CDR_PAYLOADS[1],
    );
    const sceneUpdate = createTopic(
      "/scene",
      FOXGLOVE_SCENE_UPDATE_CDR_PAYLOADS[0],
    );
    const log = createTopic("/logs", FOXGLOVE_LOG_CDR_PAYLOADS[0]);

    expect(isCompressedImageStream(compressedImage)).toBe(true);
    expect(isImageStream(compressedImage)).toBe(true);
    expect(isPointCloudStream(pointCloud)).toBe(true);
    expect(isPointCloudStream(laserScan)).toBe(true);
    expect(isImageAnnotationsStream(annotations)).toBe(true);
    expect(isSceneUpdateStream(sceneUpdate)).toBe(true);
    expect(
      isGridStream(createTopic("/grid", FOXGLOVE_GRID_CDR_PAYLOADS[0])),
    ).toBe(true);
    expect(
      isCameraCalibrationStream(
        createTopic(
          "/camera/info",
          FOXGLOVE_CAMERA_CALIBRATION_CDR_PAYLOADS[0],
        ),
      ),
    ).toBe(true);
    expect(
      isPoseStream(
        createTopic("/pose", FOXGLOVE_POSE_IN_FRAME_CDR_PAYLOADS[1]),
      ),
    ).toBe(true);
    expect(
      isLocationFixStream(
        createTopic("/gps", FOXGLOVE_LOCATION_FIX_CDR_PAYLOADS[0]),
      ),
    ).toBe(true);
    expect(isLogStream(log)).toBe(true);
    expect(
      streamTopics([
        compressedImage,
        pointCloud,
        laserScan,
        annotations,
        sceneUpdate,
        log,
      ]),
    ).toMatchObject({
      annotations: ["/camera/annotations"],
      image: ["/camera/compressed"],
      logs: ["/logs"],
      pointCloud: ["/points", "/scan"],
      previewable: ["/camera/compressed", "/points", "/scan", "/logs"],
      sceneUpdates: ["/scene"],
    });
  });
});

function text(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function compressedImageMessage(format?: string): Uint8Array {
  const fields = [protobufBytesField(2, new TextEncoder().encode("fake-jpeg"))];
  if (format !== undefined) {
    fields.push(protobufBytesField(3, new TextEncoder().encode(format)));
  }

  return concatProtobufFields(...fields);
}

function compressedVideoMessage(format?: string): Uint8Array {
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

const H264_KEYFRAME_BYTES = Uint8Array.of(
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

interface TestPointCloudField {
  readonly name: string;
  readonly offset: number;
  readonly type: number;
}

interface TestPointCloudPose {
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

function pointCloudMessage(
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

function pointCloudPoseField({
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

function packedPointCloudField({
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
function gridWireMessage({
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

function radarPointBytes(): Uint8Array {
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

function writeRadarPoint(
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

function expectArrayCloseTo(
  actual: readonly number[],
  expected: readonly number[],
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]);
  });
}

function protobufFixed32Field(fieldNumber: number, value: number): Uint8Array {
  const bytes = new Uint8Array(5);
  bytes[0] = (fieldNumber << 3) | 5;
  new DataView(bytes.buffer).setUint32(1, value, true);

  return bytes;
}

function protobufDoubleField(fieldNumber: number, value: number): Uint8Array {
  const bytes = new Uint8Array(9);
  bytes[0] = (fieldNumber << 3) | 1;
  new DataView(bytes.buffer).setFloat64(1, value, true);

  return bytes;
}

function protobufVarintField(fieldNumber: number, value: number): Uint8Array {
  return concatProtobufFields(Uint8Array.of(fieldNumber << 3), varint(value));
}

function protobufBytesField(
  fieldNumber: number,
  value: Uint8Array,
): Uint8Array {
  return concatProtobufFields(
    Uint8Array.of((fieldNumber << 3) | 2),
    varint(value.byteLength),
    value,
  );
}

function varint(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining);

  return Uint8Array.from(bytes);
}

function float32Bytes(values: readonly number[]): Uint8Array {
  const data = new Uint8Array(values.length * 4);
  const view = new DataView(data.buffer);

  values.forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });

  return data;
}

function float64Bytes(values: readonly number[]): Uint8Array {
  const data = new Uint8Array(values.length * 8);
  const view = new DataView(data.buffer);

  values.forEach((value, index) => {
    view.setFloat64(index * 8, value, true);
  });

  return data;
}

function concatProtobufFields(...fields: readonly Uint8Array[]): Uint8Array {
  const length = fields.reduce((size, field) => size + field.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const field of fields) {
    result.set(field, offset);
    offset += field.byteLength;
  }

  return result;
}

const COMPRESSED_VIDEO_ROOT = Root.fromJSON({
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

const COMPRESSED_VIDEO_SCHEMA_DATA = protobufDescriptorData(
  COMPRESSED_VIDEO_ROOT,
);

const RAW_IMAGE_ROOT = Root.fromJSON({
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

const RAW_IMAGE_SCHEMA_DATA = protobufDescriptorData(RAW_IMAGE_ROOT);

function rawImageWireMessage(): Uint8Array {
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

const ROS2_RAW_IMAGE_SCHEMA = `builtin_interfaces/Time timestamp
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

const ROS2_COMPRESSED_IMAGE_SCHEMA = `builtin_interfaces/Time timestamp
string frame_id
uint8[] data
string format
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

const ROS2_COMPRESSED_VIDEO_SCHEMA = `builtin_interfaces/Time timestamp
string frame_id
uint8[] data
string format
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

const ROS2_IDL_COMPRESSED_VIDEO_SCHEMA = `
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

const ROS2_SCENE_UPDATE_SCHEMA = `foxglove_msgs/SceneEntityDeletion[] deletions
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

const ROS2_LOG_SCHEMA = `builtin_interfaces/Time timestamp
uint8 level
string message
string name
string file
uint32 line
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

const LOG_ROOT = Root.fromJSON({
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

const LOG_SCHEMA_DATA = protobufDescriptorData(LOG_ROOT);

function decoderForSchemaEncoding(
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

function schemaData(schema: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(schema));
}

function ros2Message(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(schema, { ros2: true }),
  );
  return writer.writeMessage(record);
}

function ros2IdlMessage(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(parseRos2idl(schema));
  return writer.writeMessage(record);
}

function protobufDescriptorData(root: Root): Uint8Array {
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

function createTopic(
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
