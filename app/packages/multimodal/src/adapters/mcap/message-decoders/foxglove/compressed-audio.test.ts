import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../ir/index";
import type { CompressedAudioVisualization } from "../../../../ir/index";
import {
  foxgloveCompressedAudioCdrDecoders,
  foxgloveCompressedAudioDecoder,
} from "./compressed-audio";
import { decodeProtobufMessage } from "./protobuf/index";

vi.mock("./protobuf/index", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const mockDecode = vi.mocked(decodeProtobufMessage);

beforeEach(() => {
  mockDecode.mockReset();
});

describe("foxgloveCompressedAudioDecoder", () => {
  it("declares the foxglove.CompressedAudio payload descriptor", () => {
    expect(foxgloveCompressedAudioDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.CompressedAudio",
      schemaEncoding: "protobuf",
    });
  });

  it("decodes a supported (opus) codec with metadata", () => {
    const data = Uint8Array.of(1, 2, 3, 4);
    mockDecode.mockReturnValue(
      compressedAudioMessage({ data, format: "opus" }),
    );

    const { attributes, resourceHints, timing, visualization } =
      foxgloveCompressedAudioDecoder.decode(EMPTY_BYTES, {});
    const audio = expectCompressedAudio(visualization);

    expect(audio.format).toBe("opus");
    expect(audio.bytes).toBe(data);
    expect(audio.timestampNs).toBe(12_000_000_034n);
    expect(attributes).toMatchObject({
      byteLength: 4,
      codec: "opus",
      format: "opus",
    });
    expect(resourceHints?.transferables).toContain(data.buffer);
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("degrades a codec outside the supported table without throwing", () => {
    mockDecode.mockReturnValue(
      compressedAudioMessage({ data: Uint8Array.of(1, 2), format: "vorbis" }),
    );
    const output = foxgloveCompressedAudioDecoder.decode(EMPTY_BYTES, {});

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      format: "vorbis",
      unsupportedReason:
        "Foxglove CompressedAudio format 'vorbis' is unsupported",
    });
  });

  it("degrades a missing format without throwing", () => {
    mockDecode.mockReturnValue(
      compressedAudioMessage({ data: Uint8Array.of(1, 2), format: "" }),
    );
    const output = foxgloveCompressedAudioDecoder.decode(EMPTY_BYTES, {});

    expect(output.visualization).toBeUndefined();
    expect(output.attributes?.format).toBe("unknown");
    expect(output.attributes?.unsupportedReason).toBe(
      "Foxglove CompressedAudio format is missing",
    );
  });

  it("registers CDR decoders for both ROS 2 schema spellings", () => {
    expect(
      foxgloveCompressedAudioCdrDecoders.map((decoder) => decoder.payload),
    ).toEqual([
      {
        encoding: "cdr",
        schema: "foxglove_msgs/msg/CompressedAudio",
        schemaEncoding: "ros2msg",
      },
      {
        encoding: "cdr",
        schema: "foxglove_msgs/msg/CompressedAudio",
        schemaEncoding: "ros2idl",
      },
    ]);
    expect(
      foxgloveCompressedAudioCdrDecoders.map((decoder) => decoder.id),
    ).toEqual([
      "foxglove.compressed-audio.cdr.ros2msg",
      "foxglove.compressed-audio.cdr.ros2idl",
    ]);
  });
});

function compressedAudioMessage({
  data,
  format,
}: {
  readonly data: Uint8Array;
  readonly format: string;
}): Record<string, unknown> {
  return {
    data,
    format,
    timestamp: { nanos: 34, seconds: 12 },
  };
}

function expectCompressedAudio(
  visualization: unknown,
): CompressedAudioVisualization {
  const audio = visualization as CompressedAudioVisualization | undefined;
  if (audio?.kind !== VISUALIZATION_KIND.COMPRESSED_AUDIO) {
    throw new Error("Expected compressed audio visualization");
  }
  return audio;
}
