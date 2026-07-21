import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../ir";
import type { RawImageVisualization } from "../../../../ir";
import { decodeProtobufMessage } from "./protobuf";
import {
  foxgloveRawImageCdrDecoders,
  foxgloveRawImageDecoder,
} from "./raw-image";

vi.mock("./protobuf", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const mockDecode = vi.mocked(decodeProtobufMessage);

beforeEach(() => {
  mockDecode.mockReset();
});

describe("foxgloveRawImageDecoder", () => {
  it("declares the foxglove.RawImage payload descriptor", () => {
    expect(foxgloveRawImageDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.RawImage",
      schemaEncoding: "protobuf",
    });
  });

  it("decodes rgb8 pixels into raw RGBA with metadata", () => {
    mockDecode.mockReturnValue(
      rawImageMessage({
        data: Uint8Array.of(255, 0, 0, 0, 255, 0),
        encoding: "rgb8",
        height: 1,
        step: 6,
        width: 2,
      }),
    );

    const { attributes, resourceHints, timing, visualization } =
      foxgloveRawImageDecoder.decode(EMPTY_BYTES, {});
    const image = expectRawImage(visualization);

    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    expect(image.coordinateFrameId).toBe("CAM_RAW");
    expect(image.sourceEncoding).toBe("rgb8");
    expect(image.timestampNs).toBe(12_000_000_034n);
    expect(Array.from(image.rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(attributes).toMatchObject({
      byteLength: 6,
      encoding: "rgb8",
      frameId: "CAM_RAW",
      height: 1,
      step: 6,
      width: 2,
    });
    expect(resourceHints?.transferables).toContain(image.rgba.buffer);
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
    expect(timing?.timeRange?.startNs).toBe(12_000_000_034n);
  });

  it("decodes 16UC1 depth as little-endian with normalization bounds", () => {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setUint16(0, 1_000, true);
    new DataView(data.buffer).setUint16(2, 2_000, true);
    mockDecode.mockReturnValue(
      rawImageMessage({
        data,
        encoding: "16UC1",
        height: 1,
        step: 4,
        width: 2,
      }),
    );

    const { attributes, resourceHints, visualization } =
      foxgloveRawImageDecoder.decode(EMPTY_BYTES, {});
    const image = expectRawImage(visualization);

    expect(Array.from(image.rgba)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(image.depth?.metersPerUnit).toBe(0.001);
    expect(image.depth?.values).toBeInstanceOf(Uint16Array);
    expect(Array.from(image.depth?.values ?? [])).toEqual([1_000, 2_000]);
    expect(resourceHints?.transferables).toContain(image.depth?.values.buffer);
    expect(attributes).toMatchObject({
      depthMax: 2_000,
      depthMin: 1_000,
    });
  });

  it("decodes packed uyvy and yuyv chroma pairs", () => {
    // Black then white luma with neutral chroma; both byte orders must agree.
    mockDecode.mockReturnValue(
      rawImageMessage({
        data: Uint8Array.of(128, 16, 128, 235),
        encoding: "uyvy",
        height: 1,
        step: 4,
        width: 2,
      }),
    );
    const uyvy = expectRawImage(
      foxgloveRawImageDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expect(Array.from(uyvy.rgba)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);

    mockDecode.mockReturnValue(
      rawImageMessage({
        data: Uint8Array.of(16, 128, 235, 128),
        encoding: "yuyv",
        height: 1,
        step: 4,
        width: 2,
      }),
    );
    const yuyv = expectRawImage(
      foxgloveRawImageDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expect(Array.from(yuyv.rgba)).toEqual(Array.from(uyvy.rgba));
  });

  it("degrades unsupported or malformed frames without throwing", () => {
    mockDecode.mockReturnValue(
      rawImageMessage({
        data: Uint8Array.of(1, 2),
        encoding: "nv12",
        height: 1,
        step: 2,
        width: 1,
      }),
    );
    const unsupported = foxgloveRawImageDecoder.decode(EMPTY_BYTES, {});

    expect(unsupported.visualization).toBeUndefined();
    expect(unsupported.attributes).toMatchObject({
      encoding: "nv12",
      unsupportedReason: "Foxglove RawImage encoding 'nv12' is unsupported",
    });

    mockDecode.mockReturnValue(
      rawImageMessage({
        data: Uint8Array.of(1, 2),
        encoding: "rgb8",
        height: 1,
        step: 2,
        width: 1,
      }),
    );
    const malformed = foxgloveRawImageDecoder.decode(EMPTY_BYTES, {});

    expect(malformed.visualization).toBeUndefined();
    expect(malformed.attributes?.unsupportedReason).toContain(
      "Image step 2 cannot hold 1 pixels of 3 bytes",
    );

    mockDecode.mockReturnValue(
      rawImageMessage({
        data: Uint8Array.of(128, 16, 128, 235, 128, 16),
        encoding: "uyvy",
        height: 1,
        step: 6,
        width: 3,
      }),
    );
    const oddWidthYuv = foxgloveRawImageDecoder.decode(EMPTY_BYTES, {});

    expect(oddWidthYuv.visualization).toBeUndefined();
    expect(oddWidthYuv.attributes?.unsupportedReason).toContain(
      "requires an even image width",
    );
  });

  it("registers CDR decoders for both ROS 2 schema spellings", () => {
    expect(
      foxgloveRawImageCdrDecoders.map((decoder) => decoder.payload),
    ).toEqual([
      {
        encoding: "cdr",
        schema: "foxglove_msgs/msg/RawImage",
        schemaEncoding: "ros2msg",
      },
      {
        encoding: "cdr",
        schema: "foxglove_msgs/msg/RawImage",
        schemaEncoding: "ros2idl",
      },
    ]);
    expect(foxgloveRawImageCdrDecoders.map((decoder) => decoder.id)).toEqual([
      "foxglove.raw-image.cdr.ros2msg",
      "foxglove.raw-image.cdr.ros2idl",
    ]);
  });
});

function rawImageMessage({
  data,
  encoding,
  height,
  step,
  width,
}: {
  readonly data: Uint8Array;
  readonly encoding: string;
  readonly height: number;
  readonly step: number;
  readonly width: number;
}): Record<string, unknown> {
  return {
    data,
    encoding,
    frameId: "CAM_RAW",
    height,
    step,
    timestamp: { nanos: 34, seconds: 12 },
    width,
  };
}

function expectRawImage(visualization: unknown): RawImageVisualization {
  const image = visualization as RawImageVisualization | undefined;
  if (image?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
    throw new Error("Expected raw image visualization");
  }

  return image;
}
