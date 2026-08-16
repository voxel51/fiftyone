import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../ir/index";
import type { RawAudioVisualization } from "../../../../ir/index";
import { decodeProtobufMessage } from "./protobuf/index";
import {
  foxgloveRawAudioCdrDecoders,
  foxgloveRawAudioDecoder,
} from "./raw-audio";

vi.mock("./protobuf/index", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const mockDecode = vi.mocked(decodeProtobufMessage);

beforeEach(() => {
  mockDecode.mockReset();
});

describe("foxgloveRawAudioDecoder", () => {
  it("declares the foxglove.RawAudio payload descriptor", () => {
    expect(foxgloveRawAudioDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.RawAudio",
      schemaEncoding: "protobuf",
    });
  });

  it("decodes pcm-s16 samples with metadata", () => {
    const data = new Uint8Array(8);
    const view = new DataView(data.buffer);
    view.setInt16(0, 1000, true);
    view.setInt16(2, -1000, true);
    view.setInt16(4, 2000, true);
    view.setInt16(6, -2000, true);
    mockDecode.mockReturnValue(
      rawAudioMessage({
        data,
        format: "pcm-s16",
        numberOfChannels: 2,
        sampleRate: 48_000,
      }),
    );

    const { attributes, resourceHints, timing, visualization } =
      foxgloveRawAudioDecoder.decode(EMPTY_BYTES, {});
    const audio = expectRawAudio(visualization);

    expect(audio.sampleRate).toBe(48_000);
    expect(audio.channels).toBe(2);
    expect(audio.samples).toBeInstanceOf(Int16Array);
    expect(Array.from(audio.samples)).toEqual([1000, -1000, 2000, -2000]);
    expect(audio.timestampNs).toBe(12_000_000_034n);
    expect(attributes).toMatchObject({
      byteLength: 8,
      channels: 2,
      format: "pcm-s16",
      pcmFormat: "16-bit signed PCM",
      sampleRate: 48_000,
    });
    expect(resourceHints?.transferables).toContain(data.buffer);
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("decodes pcm-f32 samples", () => {
    const data = new Uint8Array(8);
    new DataView(data.buffer).setFloat32(0, 0.5, true);
    new DataView(data.buffer).setFloat32(4, -0.5, true);
    mockDecode.mockReturnValue(
      rawAudioMessage({ data, format: "pcm-f32", numberOfChannels: 1, sampleRate: 16_000 }),
    );

    const audio = expectRawAudio(
      foxgloveRawAudioDecoder.decode(EMPTY_BYTES, {}).visualization,
    );
    expect(audio.samples).toBeInstanceOf(Float32Array);
    expect(Array.from(audio.samples)).toEqual([0.5, -0.5]);
  });

  it("degrades an unsupported format without throwing", () => {
    mockDecode.mockReturnValue(
      rawAudioMessage({
        data: Uint8Array.of(1, 2),
        format: "pcm-s24",
        numberOfChannels: 1,
        sampleRate: 44_100,
      }),
    );
    const output = foxgloveRawAudioDecoder.decode(EMPTY_BYTES, {});

    expect(output.visualization).toBeUndefined();
    expect(output.attributes).toMatchObject({
      format: "pcm-s24",
      unsupportedReason: "Foxglove RawAudio format 'pcm-s24' is unsupported",
    });
  });

  it("degrades a non-positive sample rate or channel count without throwing", () => {
    mockDecode.mockReturnValue(
      rawAudioMessage({
        data: Uint8Array.of(1, 2),
        format: "pcm-s16",
        numberOfChannels: 0,
        sampleRate: 48_000,
      }),
    );
    const zeroChannels = foxgloveRawAudioDecoder.decode(EMPTY_BYTES, {});
    expect(zeroChannels.visualization).toBeUndefined();
    expect(zeroChannels.attributes?.unsupportedReason).toContain(
      "positive sample rate and channel count",
    );
  });

  it("registers CDR decoders for both ROS 2 schema spellings", () => {
    expect(
      foxgloveRawAudioCdrDecoders.map((decoder) => decoder.payload),
    ).toEqual([
      {
        encoding: "cdr",
        schema: "foxglove_msgs/msg/RawAudio",
        schemaEncoding: "ros2msg",
      },
      {
        encoding: "cdr",
        schema: "foxglove_msgs/msg/RawAudio",
        schemaEncoding: "ros2idl",
      },
    ]);
    expect(foxgloveRawAudioCdrDecoders.map((decoder) => decoder.id)).toEqual([
      "foxglove.raw-audio.cdr.ros2msg",
      "foxglove.raw-audio.cdr.ros2idl",
    ]);
  });
});

function rawAudioMessage({
  data,
  format,
  numberOfChannels,
  sampleRate,
}: {
  readonly data: Uint8Array;
  readonly format: string;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
}): Record<string, unknown> {
  return {
    data,
    format,
    numberOfChannels,
    sampleRate,
    timestamp: { nanos: 34, seconds: 12 },
  };
}

function expectRawAudio(visualization: unknown): RawAudioVisualization {
  const audio = visualization as RawAudioVisualization | undefined;
  if (audio?.kind !== VISUALIZATION_KIND.RAW_AUDIO) {
    throw new Error("Expected raw audio visualization");
  }
  return audio;
}
