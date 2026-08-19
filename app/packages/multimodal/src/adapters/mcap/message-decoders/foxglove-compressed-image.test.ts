import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import {
  foxgloveCompressedImageCdrDecoders,
  foxgloveCompressedImageDecoder,
} from "./foxglove/index";
import { COMPRESSED_IMAGE_FIXTURE } from "./foxglove.test-fixtures";
import {
  ROS2_COMPRESSED_IMAGE_SCHEMA,
  compressedImageMessage,
  decoderForSchemaEncoding,
  ros2Message,
  schemaData,
  text,
} from "./foxglove.test-helpers";

describe("Foxglove compressed-image decoders", () => {
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
});
