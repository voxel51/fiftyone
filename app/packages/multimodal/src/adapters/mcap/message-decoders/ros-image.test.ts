import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { rosCameraInfoDecoders, rosImageDecoders } from "./ros/index";
import {
  ROS1_IMAGE_SCHEMA,
  ROS2_CAMERA_INFO_SCHEMA,
  ROS2_IDL_IMAGE_SCHEMA,
  ROS2_IMAGE_SCHEMA,
  decoderForSchemaEncoding,
  float32Bytes,
  rawRgba,
  ros1ImageMessage,
  ros2Header,
  ros2IdlImageMessage,
  ros2ImageMessage,
  ros2Message,
  schemaData,
  uint16Bytes,
} from "./ros.test-helpers";

describe("ROS image and camera decoders", () => {
  it("decodes ros1 Image RGB/BGR rows with padding into raw RGBA", () => {
    const rgb = decoderForSchemaEncoding(rosImageDecoders, "ros1msg").decode(
      ros1ImageMessage({
        data: [1, 2, 3, 4, 5, 6, 99, 99, 7, 8, 9, 10, 11, 12, 88, 88],
        encoding: "rgb8",
        height: 2,
        step: 8,
        width: 2,
      }),
      { schemaData: schemaData(ROS1_IMAGE_SCHEMA) },
    );
    const bgr = decoderForSchemaEncoding(rosImageDecoders, "ros1msg").decode(
      ros1ImageMessage({
        data: [10, 20, 30, 1, 2, 3],
        encoding: "bgr8",
        height: 1,
        step: 6,
        width: 2,
      }),
      { schemaData: schemaData(ROS1_IMAGE_SCHEMA) },
    );

    expect(rgb.visualization?.kind).toBe(VISUALIZATION_KIND.RAW_IMAGE);
    if (rgb.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
      throw new Error("Expected raw image visualization");
    }
    expect(Array.from(rgb.visualization.rgba)).toEqual([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);
    expect(rgb.visualization).toMatchObject({
      coordinateFrameId: "camera",
      height: 2,
      sourceEncoding: "rgb8",
      timestampNs: 1_000_000_002n,
      width: 2,
    });
    expect(rgb.attributes).toMatchObject({
      byteLength: 16,
      encoding: "rgb8",
      frameId: "camera",
      step: 8,
    });
    expect(rgb.resourceHints?.transferables).toContain(
      rgb.visualization.rgba.buffer,
    );

    expect(bgr.visualization?.kind).toBe(VISUALIZATION_KIND.RAW_IMAGE);
    if (bgr.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
      throw new Error("Expected raw image visualization");
    }
    expect(Array.from(bgr.visualization.rgba)).toEqual([
      30, 20, 10, 255, 3, 2, 1, 255,
    ]);
  });

  it("decodes mono Image encodings and numeric big-endian data", () => {
    const mono8 = decoderForSchemaEncoding(rosImageDecoders, "ros2msg").decode(
      ros2ImageMessage({
        data: [0, 128, 255],
        encoding: "mono8",
        height: 1,
        step: 3,
        width: 3,
      }),
      { schemaData: schemaData(ROS2_IMAGE_SCHEMA) },
    );
    const mono16BigEndian = decoderForSchemaEncoding(
      rosImageDecoders,
      "ros2msg",
    ).decode(
      ros2ImageMessage({
        data: uint16Bytes([0, 1000, 2000], false),
        encoding: "mono16",
        height: 1,
        isBigEndian: true,
        step: 6,
        width: 3,
      }),
      { schemaData: schemaData(ROS2_IMAGE_SCHEMA) },
    );

    expect(rawRgba(mono8)).toEqual([
      0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ]);
    expect(rawRgba(mono16BigEndian)).toEqual([
      0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ]);
    expect(mono16BigEndian.attributes).toMatchObject({ bigEndian: true });
  });

  it("decodes depth Image encodings with per-frame normalization", () => {
    const depth16 = decoderForSchemaEncoding(
      rosImageDecoders,
      "ros2msg",
    ).decode(
      ros2ImageMessage({
        data: uint16Bytes([0, 1000, 2000, 1000]),
        encoding: "16UC1",
        height: 1,
        step: 8,
        width: 4,
      }),
      { schemaData: schemaData(ROS2_IMAGE_SCHEMA) },
    );
    const depth32 = decoderForSchemaEncoding(
      rosImageDecoders,
      "ros2msg",
    ).decode(
      ros2ImageMessage({
        data: float32Bytes([Number.NaN, 1.5, 3]),
        encoding: "32FC1",
        height: 1,
        step: 12,
        width: 3,
      }),
      { schemaData: schemaData(ROS2_IMAGE_SCHEMA) },
    );

    expect(depth16.attributes).toMatchObject({
      depthMax: 2000,
      depthMin: 1000,
    });
    if (depth16.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
      throw new Error("Expected raw depth image visualization");
    }
    expect(depth16.visualization.rgba).toHaveLength(0);
    expect(depth16.visualization.depth?.metersPerUnit).toBe(0.001);
    expect(depth16.visualization.depth).toMatchObject({
      maxValue: 2000,
      minValue: 1000,
    });
    expect(depth16.visualization.depth?.values).toBeInstanceOf(Uint16Array);
    expect(Array.from(depth16.visualization.depth?.values ?? [])).toEqual([
      0, 1000, 2000, 1000,
    ]);
    expect(depth16.resourceHints?.transferables).toContain(
      depth16.visualization.depth?.values.buffer,
    );
    expect(depth32.attributes).toMatchObject({
      depthMax: 3,
      depthMin: 1.5,
    });
    if (depth32.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
      throw new Error("Expected raw depth image visualization");
    }
    expect(depth32.visualization.rgba).toHaveLength(0);
    expect(depth32.visualization.depth?.metersPerUnit).toBe(1);
    expect(depth32.visualization.depth).toMatchObject({
      maxValue: 3,
      minValue: 1.5,
    });
    expect(depth32.visualization.depth?.values).toBeInstanceOf(Float32Array);
    expect(Array.from(depth32.visualization.depth?.values ?? [])).toEqual([
      Number.NaN,
      1.5,
      3,
    ]);
  });

  it("decodes ros2 idl Bayer Image with deterministic demosaic", () => {
    const output = decoderForSchemaEncoding(rosImageDecoders, "ros2idl").decode(
      ros2IdlImageMessage({
        data: [100, 50, 60, 10],
        encoding: "bayer_rggb8",
        height: 2,
        step: 2,
        width: 2,
      }),
      { schemaData: schemaData(ROS2_IDL_IMAGE_SCHEMA) },
    );

    expect(rawRgba(output)).toEqual([
      100, 55, 10, 255, 100, 50, 10, 255, 100, 60, 10, 255, 100, 55, 10, 255,
    ]);
  });

  it("degrades unsupported or malformed Image frames without throwing", () => {
    const decoder = decoderForSchemaEncoding(rosImageDecoders, "ros1msg");
    const unsupported = decoder.decode(
      ros1ImageMessage({
        data: [1, 2],
        encoding: "nv12",
        height: 1,
        step: 2,
        width: 1,
      }),
      { schemaData: schemaData(ROS1_IMAGE_SCHEMA) },
    );
    const malformed = decoder.decode(
      ros1ImageMessage({
        data: [1, 2, 3],
        encoding: "rgb8",
        height: 1,
        step: 2,
        width: 1,
      }),
      { schemaData: schemaData(ROS1_IMAGE_SCHEMA) },
    );

    expect(unsupported.visualization).toBeUndefined();
    expect(unsupported.attributes).toMatchObject({
      encoding: "nv12",
      unsupportedReason: "ROS Image encoding 'nv12' is unsupported",
    });
    expect(unsupported.resourceHints).toBeUndefined();
    expect(malformed.visualization).toBeUndefined();
    expect(malformed.attributes?.unsupportedReason).toContain(
      "Image step 2 cannot hold 1 pixels of 3 bytes",
    );
  });

  it("decodes ros2 CameraInfo lowercase calibration fields", () => {
    const K = [100, 0, 50, 0, 101, 51, 0, 0, 1];
    const output = decoderForSchemaEncoding(
      rosCameraInfoDecoders,
      "ros2msg",
    ).decode(
      ros2Message(ROS2_CAMERA_INFO_SCHEMA, {
        binning_x: 0,
        binning_y: 0,
        d: [0.1, -0.2, 0, 0, 0],
        distortion_model: "plumb_bob",
        header: ros2Header({ frameId: "camera_optical", nanosec: 6, sec: 5 }),
        height: 480,
        k: K,
        p: [100, 0, 50, 0, 0, 101, 51, 0, 0, 0, 1, 0],
        r: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        roi: {
          do_rectify: false,
          height: 0,
          width: 0,
          x_offset: 0,
          y_offset: 0,
        },
        width: 640,
      }),
      { schemaData: schemaData(ROS2_CAMERA_INFO_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(
      VISUALIZATION_KIND.CAMERA_CALIBRATION,
    );
    if (output.visualization?.kind !== VISUALIZATION_KIND.CAMERA_CALIBRATION) {
      throw new Error("Expected camera calibration visualization");
    }
    expect(output.visualization).toMatchObject({
      binningX: 0,
      binningY: 0,
      coordinateFrameId: "camera_optical",
      D: [0.1, -0.2, 0, 0, 0],
      distortionModel: "plumb_bob",
      height: 480,
      K,
      roi: {
        doRectify: false,
        height: 0,
        width: 0,
        xOffset: 0,
        yOffset: 0,
      },
      timestampNs: 5_000_000_006n,
      width: 640,
    });
  });
});
