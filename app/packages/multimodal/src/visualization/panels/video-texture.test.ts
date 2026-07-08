import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EncodedVideoVisualization } from "../../decoders";
import { VISUALIZATION_KIND } from "../visualization-registry";
import {
  createEncodedVideoTexture,
  resetVideoTextureDecodersForTests,
} from "./video-texture";

interface FakeChunk {
  readonly data: BufferSource;
  readonly timestamp: number;
  readonly type: "key" | "delta";
}

interface FakeFrame {
  readonly close: ReturnType<typeof vi.fn>;
  readonly displayHeight: number;
  readonly displayWidth: number;
}

const fakeDecoderInstances: FakeVideoDecoder[] = [];

beforeEach(() => {
  resetVideoTextureDecodersForTests();
  fakeDecoderInstances.length = 0;
  FakeVideoDecoder.isConfigSupported.mockClear();
  vi.stubGlobal("EncodedVideoChunk", FakeEncodedVideoChunk);
  vi.stubGlobal("VideoDecoder", FakeVideoDecoder);
  vi.stubGlobal("isSecureContext", true);
});

afterEach(() => {
  resetVideoTextureDecodersForTests();
  vi.unstubAllGlobals();
});

describe("createEncodedVideoTexture", () => {
  it("decodes H.264 keyframes into disposable Three textures", async () => {
    const handle = await createEncodedVideoTexture(
      h264Frame({ keyframe: true, timestampNs: 1000n }),
      "rec\n/camera/video\n1000",
    );

    expect(handle.imageWidth).toBe(640);
    expect(handle.imageHeight).toBe(480);
    expect(fakeDecoderInstances).toHaveLength(1);
    expect(FakeVideoDecoder.isConfigSupported).toHaveBeenCalledWith({
      avc: { format: "annexb" },
      codec: "avc1.4D001F",
      hardwareAcceleration: "no-preference",
      optimizeForLatency: true,
    });
    expect(fakeDecoderInstances[0].configuredCodec).toBe("avc1.4D001F");
    expect(fakeDecoderInstances[0].decodeCalls[0]?.type).toBe("key");

    const frame = fakeDecoderInstances[0].outputFrames[0];
    handle.dispose();
    expect(frame?.close).toHaveBeenCalledTimes(1);
  });

  it("reuses per-topic decoder sessions and cached parameter sets", async () => {
    const keyframe = await createEncodedVideoTexture(
      h264Frame({ keyframe: true, timestampNs: 1000n }),
      "rec\n/camera/video\n1000",
    );
    const delta = await createEncodedVideoTexture(
      h264Frame({
        bytes: Uint8Array.of(0, 0, 1, 0x41, 0xc0),
        hasParameterSets: false,
        keyframe: false,
        timestampNs: 2000n,
      }),
      "rec\n/camera/video\n2000",
    );

    expect(fakeDecoderInstances).toHaveLength(1);
    expect(fakeDecoderInstances[0].decodeCalls).toHaveLength(2);
    expect(
      Array.from(fakeDecoderInstances[0].decodeCalls[1]?.data as Uint8Array),
    ).toEqual([
      0, 0, 0, 1, 0x67, 0x4d, 0x00, 0x1f, 0, 0, 0, 1, 0x68, 0xce, 0, 0, 1, 0x41,
      0xc0,
    ]);

    keyframe.dispose();
    delta.dispose();
  });

  it("rejects delta frames until a keyframe has configured the session", async () => {
    await expect(
      createEncodedVideoTexture(
        h264Frame({
          bytes: Uint8Array.of(0, 0, 1, 0x41, 0xc0),
          hasParameterSets: false,
          keyframe: false,
          timestampNs: 1000n,
        }),
        "rec\n/camera/video\n1000",
      ),
    ).rejects.toThrow("Waiting for H.264 keyframe");

    expect(fakeDecoderInstances).toHaveLength(0);
  });

  it("resets decoder state on backwards timestamps", async () => {
    const keyframe = await createEncodedVideoTexture(
      h264Frame({ keyframe: true, timestampNs: 2000n }),
      "rec\n/camera/video\n2000",
    );

    await expect(
      createEncodedVideoTexture(
        h264Frame({
          bytes: Uint8Array.of(0, 0, 1, 0x41, 0xc0),
          hasParameterSets: false,
          keyframe: false,
          timestampNs: 1000n,
        }),
        "rec\n/camera/video\n1000",
      ),
    ).rejects.toThrow("Waiting for H.264 keyframe");
    expect(fakeDecoderInstances[0].resetCalls).toBe(1);

    keyframe.dispose();
  });

  it("reconfigures on keyframes with a new H.264 codec string", async () => {
    const first = await createEncodedVideoTexture(
      h264Frame({ keyframe: true, timestampNs: 1000n }),
      "rec\n/camera/video\n1000",
    );
    const second = await createEncodedVideoTexture(
      h264Frame({
        codecString: "avc1.64001F",
        keyframe: true,
        sps: Uint8Array.of(0x67, 0x64, 0x00, 0x1f),
        timestampNs: 2000n,
      }),
      "rec\n/camera/video\n2000",
    );

    expect(fakeDecoderInstances).toHaveLength(2);
    expect(fakeDecoderInstances[0].resetCalls).toBe(1);
    expect(fakeDecoderInstances[1].configuredCodec).toBe("avc1.64001F");

    first.dispose();
    second.dispose();
  });
});

function h264Frame({
  bytes = Uint8Array.of(
    0,
    0,
    0,
    1,
    0x67,
    0x4d,
    0x00,
    0x1f,
    0,
    0,
    1,
    0x68,
    0xce,
    0,
    0,
    1,
    0x65,
    0xb0,
  ),
  codecString = "avc1.4D001F",
  hasParameterSets = true,
  keyframe,
  sps = Uint8Array.of(0x67, 0x4d, 0x00, 0x1f),
  timestampNs,
}: {
  readonly bytes?: Uint8Array;
  readonly codecString?: string;
  readonly hasParameterSets?: boolean;
  readonly keyframe: boolean;
  readonly sps?: Uint8Array;
  readonly timestampNs: bigint;
}): EncodedVideoVisualization {
  return {
    bytes,
    codec: "h264",
    coordinateFrameId: "camera",
    format: "h264",
    h264: {
      ...(hasParameterSets ? { codecString } : {}),
      hasFrame: true,
      ...(hasParameterSets ? { pps: Uint8Array.of(0x68, 0xce), sps } : {}),
    },
    keyframe,
    kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    timestampNs,
  };
}

class FakeEncodedVideoChunk {
  readonly data: BufferSource;
  readonly timestamp: number;
  readonly type: "key" | "delta";

  constructor(init: FakeChunk) {
    this.data = init.data;
    this.timestamp = init.timestamp;
    this.type = init.type;
  }
}

class FakeVideoDecoder {
  static isConfigSupported = vi.fn(async () => ({ supported: true }));

  readonly decodeCalls: FakeChunk[] = [];
  readonly outputFrames: FakeFrame[] = [];
  configuredCodec: string | null = null;
  resetCalls = 0;

  constructor(
    private readonly init: {
      readonly error: (error: unknown) => void;
      readonly output: (frame: FakeFrame) => void;
    },
  ) {
    fakeDecoderInstances.push(this);
  }

  close(): void {
    // no-op in the fake
  }

  configure(config: { readonly codec: string }): void {
    this.configuredCodec = config.codec;
  }

  decode(chunk: FakeChunk): void {
    this.decodeCalls.push(chunk);
    const frame = {
      close: vi.fn(),
      displayHeight: 480,
      displayWidth: 640,
    };
    this.outputFrames.push(frame);
    this.init.output(frame);
  }

  reset(): void {
    this.resetCalls += 1;
  }
}
