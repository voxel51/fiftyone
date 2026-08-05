import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EncodedVideoVisualization } from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { createImageTexture } from "./image-texture";
import {
  createEncodedVideoCanvas,
  createEncodedVideoTexture,
  releaseEncodedVideoSession,
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
  readonly timestamp: number;
}

const fakeDecoderInstances: FakeVideoDecoder[] = [];

beforeEach(() => {
  resetVideoTextureDecodersForTests();
  fakeDecoderInstances.length = 0;
  FakeVideoDecoder.decodeBehavior = "output";
  FakeVideoDecoder.isConfigSupported = vi.fn(async () => ({ supported: true }));
  vi.stubGlobal("EncodedVideoChunk", FakeEncodedVideoChunk);
  vi.stubGlobal("VideoDecoder", FakeVideoDecoder);
  vi.stubGlobal("isSecureContext", true);
});

afterEach(() => {
  resetVideoTextureDecodersForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
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

  it("decodes a delta target after replaying its keyframe runway", async () => {
    const keyframe = h264Frame({ keyframe: true, timestampNs: 1000n });
    const delta = h264Frame({
      hasParameterSets: false,
      keyframe: false,
      timestampNs: 2000n,
    });
    const target = h264Frame({
      hasParameterSets: false,
      keyframe: false,
      timestampNs: 3000n,
    });

    const handle = await createImageTexture(
      target,
      "rec\n/camera/video\n3000",
      [keyframe, delta],
    );

    expect(fakeDecoderInstances).toHaveLength(1);
    expect(
      fakeDecoderInstances[0].decodeCalls.map((call) => call.type),
    ).toEqual(["key", "delta", "delta"]);
    expect(fakeDecoderInstances[0].outputFrames[0]?.close).toHaveBeenCalled();
    expect(fakeDecoderInstances[0].outputFrames[1]?.close).toHaveBeenCalled();
    handle.dispose();
  });

  it("submits a runway as one atomic decoder job and retains only its target", async () => {
    FakeVideoDecoder.decodeBehavior = "hold";
    const keyframe = h264Frame({ keyframe: true, timestampNs: 1000n });
    const delta = h264Frame({
      hasParameterSets: false,
      keyframe: false,
      timestampNs: 2000n,
    });
    const target = h264Frame({
      hasParameterSets: false,
      keyframe: false,
      timestampNs: 3000n,
    });

    const first = createEncodedVideoTexture(
      target,
      "rec\n/camera/video\n3000",
      [keyframe, delta],
    );
    await vi.waitFor(() => {
      expect(fakeDecoderInstances[0]?.decodeCalls).toHaveLength(3);
    });

    const second = createEncodedVideoTexture(
      h264Frame({
        hasParameterSets: false,
        keyframe: false,
        timestampNs: 4000n,
      }),
      "rec\n/camera/video\n4000",
    );
    await Promise.resolve();
    expect(fakeDecoderInstances[0].decodeCalls).toHaveLength(3);

    const decoder = fakeDecoderInstances[0];
    decoder.outputNext();
    decoder.outputNext();
    decoder.outputNext();
    const firstHandle = await first;
    expect(decoder.outputFrames[0]?.close).toHaveBeenCalledTimes(1);
    expect(decoder.outputFrames[1]?.close).toHaveBeenCalledTimes(1);
    expect(decoder.outputFrames[2]?.close).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(decoder.decodeCalls).toHaveLength(4));
    decoder.outputNext();
    const secondHandle = await second;

    firstHandle.dispose();
    secondHandle.dispose();
    expect(decoder.outputFrames[2]?.close).toHaveBeenCalledTimes(1);
    expect(decoder.outputFrames[3]?.close).toHaveBeenCalledTimes(1);
  });

  it("bounds prerequisite replay to the latest 600 video frames", async () => {
    const runway = Array.from({ length: 601 }, (_, index) =>
      h264Frame({
        keyframe: true,
        timestampNs: BigInt(index + 1) * 1_000n,
      }),
    );
    const target = h264Frame({ keyframe: true, timestampNs: 602_000n });

    const handle = await createImageTexture(
      target,
      "rec\n/camera/video\n602000",
      runway,
    );

    expect(fakeDecoderInstances[0].decodeCalls).toHaveLength(601);
    expect(fakeDecoderInstances[0].decodeCalls[0]?.timestamp).toBe(2);
    handle.dispose();
  });

  it("retains the keyframe immediately before the prerequisite cap", async () => {
    const runway = [
      h264Frame({ keyframe: true, timestampNs: 1_000n }),
      ...Array.from({ length: 600 }, (_, index) =>
        h264Frame({
          hasParameterSets: false,
          keyframe: false,
          timestampNs: BigInt(index + 2) * 1_000n,
        }),
      ),
    ];
    const target = h264Frame({
      hasParameterSets: false,
      keyframe: false,
      timestampNs: 602_000n,
    });

    const handle = await createImageTexture(
      target,
      "rec\n/camera/video\n602000",
      runway,
    );

    expect(fakeDecoderInstances[0].decodeCalls).toHaveLength(602);
    expect(fakeDecoderInstances[0].decodeCalls[0]?.type).toBe("key");
    expect(fakeDecoderInstances[0].decodeCalls[1]?.type).toBe("delta");
    handle.dispose();
  });

  it("rejects a missing H.264 target instead of returning a runway frame", async () => {
    const keyframe = h264Frame({ keyframe: true, timestampNs: 1_000n });
    const target = h264Frame({
      hasFrame: false,
      hasParameterSets: false,
      keyframe: false,
      timestampNs: 2_000n,
    });

    await expect(
      createEncodedVideoTexture(target, "rec\n/camera/video\n2000", [keyframe]),
    ).rejects.toThrow("Waiting for H.264 target frame");
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

  it("rejects pending textures when the decoder reports an error", async () => {
    FakeVideoDecoder.decodeBehavior = "hold";

    const texture = createEncodedVideoTexture(
      h264Frame({ keyframe: true, timestampNs: 1000n }),
      "rec\n/camera/video\n1000",
    );
    await vi.waitFor(() => {
      expect(fakeDecoderInstances[0]?.decodeCalls).toHaveLength(1);
    });

    const expectation = expect(texture).rejects.toThrow("decoder failed");
    fakeDecoderInstances[0].fail(new Error("decoder failed"));

    await expectation;
    expect(fakeDecoderInstances[0].resetCalls).toBe(1);
    expect(fakeDecoderInstances[0].closeCalls).toBe(1);
  });

  it("cancels the active and queued jobs when their stream session closes", async () => {
    FakeVideoDecoder.decodeBehavior = "hold";
    const firstFrame = h264Frame({ keyframe: true, timestampNs: 1000n });
    const first = createEncodedVideoTexture(
      firstFrame,
      "rec\n/camera/video\n1000",
    );
    const second = createEncodedVideoTexture(
      h264Frame({ keyframe: false, timestampNs: 2000n }),
      "rec\n/camera/video\n2000",
    );
    await vi.waitFor(() => {
      expect(fakeDecoderInstances[0]?.decodeCalls).toHaveLength(1);
    });

    releaseEncodedVideoSession(firstFrame, "rec\n/camera/video\n1000");

    await expect(first).rejects.toThrow("Video decoder closed");
    await expect(second).rejects.toThrow("Video decoder closed");
    expect(fakeDecoderInstances[0].decodeCalls).toHaveLength(1);
    expect(fakeDecoderInstances[0].closeCalls).toBe(1);
  });

  it("rejects pending textures and resets the decoder on decode timeout", async () => {
    vi.useFakeTimers();
    FakeVideoDecoder.decodeBehavior = "hold";

    const texture = createEncodedVideoTexture(
      h264Frame({ keyframe: true, timestampNs: 1000n }),
      "rec\n/camera/video\n1000",
    );
    await Promise.resolve();

    const expectation = expect(texture).rejects.toThrow(
      "Timed out waiting for H.264 frame decode",
    );
    await vi.advanceTimersByTimeAsync(3000);

    await expectation;
    expect(fakeDecoderInstances[0].resetCalls).toBe(1);
    expect(fakeDecoderInstances[0].closeCalls).toBe(1);
  });
});

describe("createEncodedVideoCanvas", () => {
  it("decodes H.264 keyframes into canvases and closes decoded frames", async () => {
    const context = stubVideoCanvasContext();
    const drawImage = vi
      .spyOn(context, "drawImage")
      .mockImplementation(() => undefined);

    const canvas = await createEncodedVideoCanvas(
      h264Frame({ keyframe: true, timestampNs: 1000n }),
      "rec\n/camera/video\n1000",
    );

    const frame = fakeDecoderInstances[0].outputFrames[0];
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    expect(drawImage).toHaveBeenCalledWith(frame, 0, 0, 640, 480);
    expect(frame?.close).toHaveBeenCalledTimes(1);
  });

  it("evicts least-recently-used decoder sessions from canvas previews", async () => {
    stubVideoCanvasContext();

    for (let index = 0; index < 7; index += 1) {
      await createEncodedVideoCanvas(
        h264Frame({ keyframe: true, timestampNs: BigInt(index + 1) }),
        `rec\n/camera/${index}\n${index}`,
      );
    }

    expect(fakeDecoderInstances).toHaveLength(7);
    expect(fakeDecoderInstances[0].closeCalls).toBe(1);
    expect(fakeDecoderInstances[1].closeCalls).toBe(0);
  });
});

function stubVideoCanvasContext(): CanvasRenderingContext2D {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    throw new Error("shared canvas 2d mock missing");
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as never,
  );
  return context;
}

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
  hasFrame = true,
  keyframe,
  sps = Uint8Array.of(0x67, 0x4d, 0x00, 0x1f),
  timestampNs,
}: {
  readonly bytes?: Uint8Array;
  readonly codecString?: string;
  readonly hasParameterSets?: boolean;
  readonly hasFrame?: boolean;
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
      hasFrame,
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
  static decodeBehavior: "hold" | "output" = "output";

  readonly decodeCalls: FakeChunk[] = [];
  readonly outputFrames: FakeFrame[] = [];
  closeCalls = 0;
  configuredCodec: string | null = null;
  resetCalls = 0;
  private outputIndex = 0;

  constructor(
    private readonly init: {
      readonly error: (error: unknown) => void;
      readonly output: (frame: FakeFrame) => void;
    },
  ) {
    fakeDecoderInstances.push(this);
  }

  close(): void {
    this.closeCalls += 1;
  }

  configure(config: { readonly codec: string }): void {
    this.configuredCodec = config.codec;
  }

  decode(chunk: FakeChunk): void {
    this.decodeCalls.push(chunk);
    if (FakeVideoDecoder.decodeBehavior === "hold") {
      return;
    }

    this.outputNext();
  }

  outputNext(): void {
    const chunk = this.decodeCalls[this.outputIndex];
    if (!chunk) throw new Error("No held decoder output is available");
    this.outputIndex += 1;
    const frame = {
      close: vi.fn(),
      displayHeight: 480,
      displayWidth: 640,
      timestamp: chunk.timestamp,
    };
    this.outputFrames.push(frame);
    this.init.output(frame);
  }

  reset(): void {
    this.resetCalls += 1;
  }

  fail(error: Error): void {
    this.init.error(error);
  }
}
