import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../visualization";
import { createMcapDecoderRegistry } from ".";
import {
  foxgloveCompressedImageDecoder,
  foxglovePointCloudDecoder,
} from "./foxglove";
import { optionalBigInt } from "./foxglove/protobuf/records";

const IMAGE_SCHEMA_B64 =
  "Cv8BCh9nb29nbGUvcHJvdG9idWYvdGltZXN0YW1wLnByb3RvEg9nb29nbGUucHJvdG9idWYiOwoJVGltZXN0YW1wEhgKB3NlY29uZHMYASABKANSB3NlY29uZHMSFAoFbmFub3MYAiABKAVSBW5hbm9zQoUBChNjb20uZ29vZ2xlLnByb3RvYnVmQg5UaW1lc3RhbXBQcm90b1ABWjJnb29nbGUuZ29sYW5nLm9yZy9wcm90b2J1Zi90eXBlcy9rbm93bi90aW1lc3RhbXBwYvgBAaICA0dQQqoCHkdvb2dsZS5Qcm90b2J1Zi5XZWxsS25vd25UeXBlc2IGcHJvdG8zCsUBCh5mb3hnbG92ZS9Db21wcmVzc2VkSW1hZ2UucHJvdG8SCGZveGdsb3ZlGh9nb29nbGUvcHJvdG9idWYvdGltZXN0YW1wLnByb3RvInAKD0NvbXByZXNzZWRJbWFnZRItCgl0aW1lc3RhbXAYASABKAsyGi5nb29nbGUucHJvdG9idWYuVGltZXN0YW1wEhAKCGZyYW1lX2lkGAQgASgJEgwKBGRhdGEYAiABKAwSDgoGZm9ybWF0GAMgASgJYgZwcm90bzM=";
const IMAGE_MESSAGE_B64 =
  "CggIexCAhLjZARIJZmFrZS1qcGVnGgRqcGVnIghDQU1fVEVTVA==";
const POINT_SCHEMA_B64 =
  "CpsCCiFmb3hnbG92ZS9QYWNrZWRFbGVtZW50RmllbGQucHJvdG8SCGZveGdsb3ZlIuMBChJQYWNrZWRFbGVtZW50RmllbGQSDAoEbmFtZRgBIAEoCRIOCgZvZmZzZXQYAiABKAcSNgoEdHlwZRgDIAEoDjIoLmZveGdsb3ZlLlBhY2tlZEVsZW1lbnRGaWVsZC5OdW1lcmljVHlwZSJ3CgtOdW1lcmljVHlwZRILCgdVTktOT1dOEAASCQoFVUlOVDgQARIICgRJTlQ4EAISCgoGVUlOVDE2EAMSCQoFSU5UMTYQBBIKCgZVSU5UMzIQBRIJCgVJTlQzMhAGEgsKB0ZMT0FUMzIQBxILCgdGTE9BVDY0EAhiBnByb3RvMwpnChlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvEghmb3hnbG92ZSI4CgpRdWF0ZXJuaW9uEgkKAXgYASABKAESCQoBeRgCIAEoARIJCgF6GAMgASgBEgkKAXcYBCABKAFiBnByb3RvMwpWChZmb3hnbG92ZS9WZWN0b3IzLnByb3RvEghmb3hnbG92ZSIqCgdWZWN0b3IzEgkKAXgYASABKAESCQoBeRgCIAEoARIJCgF6GAMgASgBYgZwcm90bzMKsgEKE2ZveGdsb3ZlL1Bvc2UucHJvdG8SCGZveGdsb3ZlGhlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvGhZmb3hnbG92ZS9WZWN0b3IzLnByb3RvIlYKBFBvc2USIwoIcG9zaXRpb24YASABKAsyES5mb3hnbG92ZS5WZWN0b3IzEikKC29yaWVudGF0aW9uGAIgASgLMhQuZm94Z2xvdmUuUXVhdGVybmlvbmIGcHJvdG8zCv8BCh9nb29nbGUvcHJvdG9idWYvdGltZXN0YW1wLnByb3RvEg9nb29nbGUucHJvdG9idWYiOwoJVGltZXN0YW1wEhgKB3NlY29uZHMYASABKANSB3NlY29uZHMSFAoFbmFub3MYAiABKAVSBW5hbm9zQoUBChNjb20uZ29vZ2xlLnByb3RvYnVmQg5UaW1lc3RhbXBQcm90b1ABWjJnb29nbGUuZ29sYW5nLm9yZy9wcm90b2J1Zi90eXBlcy9rbm93bi90aW1lc3RhbXBwYvgBAaICA0dQQqoCHkdvb2dsZS5Qcm90b2J1Zi5XZWxsS25vd25UeXBlc2IGcHJvdG8zCsYCChlmb3hnbG92ZS9Qb2ludENsb3VkLnByb3RvEghmb3hnbG92ZRohZm94Z2xvdmUvUGFja2VkRWxlbWVudEZpZWxkLnByb3RvGhNmb3hnbG92ZS9Qb3NlLnByb3RvGh9nb29nbGUvcHJvdG9idWYvdGltZXN0YW1wLnByb3RvIr0BCgpQb2ludENsb3VkEi0KCXRpbWVzdGFtcBgBIAEoCzIaLmdvb2dsZS5wcm90b2J1Zi5UaW1lc3RhbXASEAoIZnJhbWVfaWQYAiABKAkSHAoEcG9zZRgDIAEoCzIOLmZveGdsb3ZlLlBvc2USFAoMcG9pbnRfc3RyaWRlGAQgASgHEiwKBmZpZWxkcxgFIAMoCzIcLmZveGdsb3ZlLlBhY2tlZEVsZW1lbnRGaWVsZBIMCgRkYXRhGAYgASgMYgZwcm90bzM=";
const POINT_MESSAGE_B64 =
  "CggIexCBhLjZARIKTElEQVJfVEVTVCUMAAAAKgUKAXgYByoKCgF5FQQAAAAYByoKCgF6FQgAAAAYBzIYAACAPwAAAEAAAEBAAACAQAAAoEAAAMBA";

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
      bytes(IMAGE_MESSAGE_B64),
      {
        schemaData: bytes(IMAGE_SCHEMA_B64),
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
        schemaData: bytes(IMAGE_SCHEMA_B64),
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
    const output = foxglovePointCloudDecoder.decode(bytes(POINT_MESSAGE_B64), {
      schemaData: bytes(POINT_SCHEMA_B64),
      sourceTimestamps: {
        captureTime: 10n,
        receiveTime: 11n,
      },
      streamId: "/lidar",
      timeRangeStartKey: "captureTime",
    });

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

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

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
