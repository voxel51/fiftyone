import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../ir/index";
import type { RawAudioVisualization } from "../../../../ir/index";
import { decodeRosMessage } from "../ros/common";
import { decodeProtobufMessage } from "./protobuf/index";
import {
  foxgloveRawAudioCdrDecoders,
  foxgloveRawAudioDecoder,
} from "./raw-audio";

vi.mock("./protobuf/index", () => ({
  decodeProtobufMessage: vi.fn(),
}));

vi.mock("../ros/common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ros/common")>()),
  decodeRosMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const mockDecode = vi.mocked(decodeProtobufMessage);
const mockRosDecode = vi.mocked(decodeRosMessage);

beforeEach(() => {
  mockDecode.mockReset();
  mockRosDecode.mockReset();
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
    // The emitted samples are a COPY of `data` (alignment), so the hint
    // must reference the buffer consumers actually receive.
    expect(resourceHints?.transferables).toContain(audio.samples.buffer);
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("decodes pcm-f32 samples", () => {
    const data = new Uint8Array(8);
    new DataView(data.buffer).setFloat32(0, 0.5, true);
    new DataView(data.buffer).setFloat32(4, -0.5, true);
    mockDecode.mockReturnValue(
      rawAudioMessage({
        data,
        format: "pcm-f32",
        numberOfChannels: 1,
        sampleRate: 16_000,
      }),
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

    mockDecode.mockReturnValue(
      rawAudioMessage({
        data: Uint8Array.of(1, 2),
        format: "pcm-s16",
        numberOfChannels: 1,
        sampleRate: 0,
      }),
    );
    const zeroRate = foxgloveRawAudioDecoder.decode(EMPTY_BYTES, {});
    expect(zeroRate.visualization).toBeUndefined();
    expect(zeroRate.attributes?.unsupportedReason).toContain(
      "positive sample rate and channel count",
    );

    // NaN fails every comparison, so a `<= 0` guard alone would let it
    // through and size an AudioBuffer from a non-finite rate.
    mockDecode.mockReturnValue(
      rawAudioMessage({
        data: Uint8Array.of(1, 2),
        format: "pcm-s16",
        numberOfChannels: 1,
        sampleRate: Number.NaN,
      }),
    );
    const nonFiniteRate = foxgloveRawAudioDecoder.decode(EMPTY_BYTES, {});
    expect(nonFiniteRate.visualization).toBeUndefined();
    expect(nonFiniteRate.attributes?.unsupportedReason).toContain(
      "positive sample rate and channel count",
    );
  });

  it("rejects a format that only matches Object.prototype", () => {
    // `"constructor" in PCM_FORMATS` is true; the format table must be
    // probed with `Object.hasOwn`, or this emits `samples: undefined`.
    mockDecode.mockReturnValue(
      rawAudioMessage({
        data: Uint8Array.of(1, 2),
        format: "constructor",
        numberOfChannels: 1,
        sampleRate: 48_000,
      }),
    );
    const output = foxgloveRawAudioDecoder.decode(EMPTY_BYTES, {});
    expect(output.visualization).toBeUndefined();
    expect(output.attributes?.unsupportedReason).toContain("unsupported");
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

  it("decodes CDR RawAudio, which uses snake_case field names", () => {
    // The CDR `map` reads `number_of_channels`/`sample_rate` and a ROS
    // `{sec,nsec}` timestamp — different field names from the protobuf
    // path, so a rename there would otherwise ship undetected.
    const data = new Uint8Array(4);
    new DataView(data.buffer).setInt16(0, 500, true);
    new DataView(data.buffer).setInt16(2, -500, true);
    mockRosDecode.mockReturnValue({
      data,
      format: "pcm-s16",
      number_of_channels: 2,
      sample_rate: 16_000,
      timestamp: { sec: 7, nsec: 25 },
    });

    const { attributes, visualization } = foxgloveRawAudioCdrDecoders[0].decode(
      EMPTY_BYTES,
      { schemaData: Uint8Array.of(1) },
    );
    const audio = expectRawAudio(visualization);
    expect(audio.sampleRate).toBe(16_000);
    expect(audio.channels).toBe(2);
    expect(Array.from(audio.samples)).toEqual([500, -500]);
    expect(audio.timestampNs).toBe(7_000_000_025n);
    expect(attributes).toMatchObject({ format: "pcm-s16" });
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
