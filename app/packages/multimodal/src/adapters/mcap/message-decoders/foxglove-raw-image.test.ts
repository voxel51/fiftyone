import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import {
  foxgloveRawImageCdrDecoders,
  foxgloveRawImageDecoder,
} from "./foxglove/index";
import {
  RAW_IMAGE_SCHEMA_DATA,
  ROS2_RAW_IMAGE_SCHEMA,
  decoderForSchemaEncoding,
  rawImageWireMessage,
  ros2Message,
  schemaData,
} from "./foxglove.test-helpers";

describe("Foxglove raw-image decoders", () => {
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
});
