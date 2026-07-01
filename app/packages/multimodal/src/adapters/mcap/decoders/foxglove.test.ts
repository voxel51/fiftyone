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
      foxgloveCompressedImageDecoder,
    );
    expect(registry.find(foxglovePointCloudDecoder.payload)).toBe(
      foxglovePointCloudDecoder,
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
});

function text(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function compressedImageMessage(format: string): Uint8Array {
  return concatProtobufFields(
    protobufBytesField(2, new TextEncoder().encode("fake-jpeg")),
    protobufBytesField(3, new TextEncoder().encode(format)),
  );
}

interface TestPointCloudField {
  readonly name: string;
  readonly offset: number;
  readonly type: number;
}

function pointCloudMessage(
  data: Uint8Array,
  {
    fields = [
      { name: "x", offset: 0, type: 7 },
      { name: "y", offset: 4, type: 7 },
      { name: "z", offset: 8, type: 7 },
    ],
    pointStride = 12,
  }: {
    readonly fields?: readonly TestPointCloudField[];
    readonly pointStride?: number;
  } = {},
): Uint8Array {
  return concatProtobufFields(
    protobufFixed32Field(4, pointStride),
    ...fields.map((field) => packedPointCloudField(field)),
    protobufBytesField(6, data),
  );
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
