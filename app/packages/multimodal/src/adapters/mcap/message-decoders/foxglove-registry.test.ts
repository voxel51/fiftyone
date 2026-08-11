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
} from "./foxglove/index";
import { jsonPoseDecoder } from "./json/index";
import { createTopic } from "./foxglove.test-helpers";

describe("Foxglove decoder registry and stream classification", () => {
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
