import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../visualization";
import { createMcapDecoderRegistry } from ".";
import {
  foxgloveCompressedImageDecoder,
  foxglovePointCloudDecoder,
} from "./foxglove";
import { optionalBigInt } from "./foxglove/protobuf/records";
import {
  COMPRESSED_IMAGE_FIXTURE,
  POINT_CLOUD_FIXTURE,
} from "./foxglove.test-fixtures";

describe("Foxglove decoders", () => {
  it("registers with the MCAP decoder registry", () => {
    const registry = createMcapDecoderRegistry();

    expect(registry.find(foxgloveCompressedImageDecoder.payload)).toBe(
      foxgloveCompressedImageDecoder
    );
    expect(registry.find(foxglovePointCloudDecoder.payload)).toBe(
      foxglovePointCloudDecoder
    );
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
      }
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

  it("normalizes uppercase compressed image MIME formats", () => {
    const output = foxgloveCompressedImageDecoder.decode(
      compressedImageMessage("IMAGE/JPEG"),
      {
        schemaData: COMPRESSED_IMAGE_FIXTURE.schemaData,
      }
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.ENCODED_IMAGE);
    if (output.visualization?.kind !== VISUALIZATION_KIND.ENCODED_IMAGE) {
      throw new Error("Expected encoded image visualization");
    }
    expect(output.visualization.mimeType).toBe("image/jpeg");
  });

  it("treats invalid optional bigint protobuf fields as absent", () => {
    expect(optionalBigInt({ seconds: "not-a-number" }, "seconds")).toBe(
      undefined
    );
    expect(
      optionalBigInt(
        { seconds: { toString: () => "also-not-a-number" } },
        "seconds"
      )
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
      }
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.POINT_CLOUD);
    if (output.visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
      throw new Error("Expected point cloud visualization");
    }
    expect(Array.from(output.visualization.positions)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(output.visualization.pointCount).toBe(2);
    expect(output.attributes).toMatchObject({
      frameId: "LIDAR_TEST",
      pointCount: 2,
      pointStride: 12,
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
    expect(output.timing?.sourceTimestamps?.messageTime).toBe(123456000001n);
  });
});

function text(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function compressedImageMessage(format: string): Uint8Array {
  return concatProtobufFields(
    protobufBytesField(2, new TextEncoder().encode("fake-jpeg")),
    protobufBytesField(3, new TextEncoder().encode(format))
  );
}

function protobufBytesField(
  fieldNumber: number,
  value: Uint8Array
): Uint8Array {
  return concatProtobufFields(
    Uint8Array.of((fieldNumber << 3) | 2),
    varint(value.byteLength),
    value
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
