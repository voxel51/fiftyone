import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EncodedVideoVisualization } from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { createImageTexture } from "./image-texture";
import {
  acquireEncodedVideoSession,
  createEncodedVideoCanvas,
  createEncodedVideoTexture,
  releaseEncodedVideoSession,
  releaseEncodedVideoSessionsForSource,
  resetVideoTextureDecodersForTests,
  VIDEO_DECODE_SESSION_CAP,
  videoTextureDecoderStats,
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
    const firstFrame = h264Frame({ keyframe: true, timestampNs: 1000n });
    const owner = acquireEncodedVideoSession(
      firstFrame,
      "rec\n/camera/video\n1000",
    );
    const keyframe = await owner.decodeTexture(firstFrame);
    const delta = await owner.decodeTexture(
      h264Frame({
        bytes: Uint8Array.of(0, 0, 1, 0x41, 0xc0),
        hasParameterSets: false,
        keyframe: false,
        timestampNs: 2000n,
      }),
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
    owner.release();
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
        bytes: Uint8Array.of(0, 0, 1, 0x41, 0xc0),
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

  it("consumes a complete 600-frame runway without truncating its keyframe", async () => {
    const runway = Array.from({ length: 600 }, (_, index) =>
      h264Frame({
        hasParameterSets: index === 0,
        keyframe: index === 0,
        timestampNs: BigInt(index + 1) * 1_000n,
      }),
    );
    const target = h264Frame({
      hasParameterSets: false,
      keyframe: false,
      timestampNs: 601_000n,
    });

    const handle = await createImageTexture(
      target,
      "rec\n/camera/video\n601000",
      runway,
    );

    expect(fakeDecoderInstances[0].decodeCalls).toHaveLength(601);
    expect(fakeDecoderInstances[0].decodeCalls[0]?.type).toBe("key");
    expect(fakeDecoderInstances[0].decodeCalls[0]?.timestamp).toBe(1);
    handle.dispose();
  });

  it("waits when an overlong GOP pushes its keyframe beyond the cap", async () => {
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

    await expect(
      createImageTexture(target, "rec\n/camera/video\n602000", runway),
    ).rejects.toThrow("Waiting for a bounded H.264 keyframe runway");
    expect(fakeDecoderInstances).toHaveLength(0);
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
    const firstFrame = h264Frame({ keyframe: true, timestampNs: 2000n });
    const owner = acquireEncodedVideoSession(
      firstFrame,
      "rec\n/camera/video\n2000",
    );
    const keyframe = await owner.decodeTexture(firstFrame);

    await expect(
      owner.decodeTexture(
        h264Frame({
          bytes: Uint8Array.of(0, 0, 1, 0x41, 0xc0),
          hasParameterSets: false,
          keyframe: false,
          timestampNs: 1000n,
        }),
      ),
    ).rejects.toThrow("Waiting for H.264 keyframe");
    expect(fakeDecoderInstances[0].resetCalls).toBe(1);

    keyframe.dispose();
    owner.release();
  });

  it("reconfigures on keyframes with a new H.264 codec string", async () => {
    const firstFrame = h264Frame({ keyframe: true, timestampNs: 1000n });
    const owner = acquireEncodedVideoSession(
      firstFrame,
      "rec\n/camera/video\n1000",
    );
    const first = await owner.decodeTexture(firstFrame);
    const second = await owner.decodeTexture(
      h264Frame({
        codecString: "avc1.64001F",
        keyframe: true,
        sps: Uint8Array.of(0x67, 0x64, 0x00, 0x1f),
        timestampNs: 2000n,
      }),
    );

    expect(fakeDecoderInstances).toHaveLength(2);
    expect(fakeDecoderInstances[0].resetCalls).toBe(1);
    expect(fakeDecoderInstances[1].configuredCodec).toBe("avc1.64001F");

    first.dispose();
    second.dispose();
    owner.release();
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

  it("does not create a decoder when its session closes during support lookup", async () => {
    let resolveSupport!: (result: { supported: boolean }) => void;
    FakeVideoDecoder.isConfigSupported = vi.fn(
      () =>
        new Promise<{ supported: boolean }>((resolve) => {
          resolveSupport = resolve;
        }),
    );
    const frame = h264Frame({ keyframe: true, timestampNs: 1000n });
    const texture = createEncodedVideoTexture(
      frame,
      "rec\n/camera/video\n1000",
    );
    await vi.waitFor(() => {
      expect(FakeVideoDecoder.isConfigSupported).toHaveBeenCalledOnce();
    });

    const expectation = expect(texture).rejects.toThrow("Video decoder closed");
    releaseEncodedVideoSession(frame, "rec\n/camera/video\n1000");
    resolveSupport({ supported: true });

    await expectation;
    expect(fakeDecoderInstances).toHaveLength(0);
  });

  it("closes an unmatched timestamp without resolving another waiter", async () => {
    FakeVideoDecoder.decodeBehavior = "hold";
    const texture = createEncodedVideoTexture(
      h264Frame({ keyframe: true, timestampNs: 1000n }),
      "rec\n/camera/video\n1000",
    );
    await vi.waitFor(() => {
      expect(fakeDecoderInstances[0]?.decodeCalls).toHaveLength(1);
    });

    const decoder = fakeDecoderInstances[0];
    const unmatched = decoder.outputAtTimestamp(99);
    expect(unmatched.close).toHaveBeenCalledOnce();

    decoder.outputNext();
    const handle = await texture;
    handle.dispose();
    expect(decoder.outputFrames[1]?.close).toHaveBeenCalledOnce();
  });

  it("drops a stale queued request while preserving its delta dependency", async () => {
    FakeVideoDecoder.decodeBehavior = "hold";
    const keyframe = h264Frame({ keyframe: true, timestampNs: 1_000n });
    const owner = acquireEncodedVideoSession(
      keyframe,
      "rec\n/camera/video\n1000",
    );
    const first = owner.decodeTexture(keyframe);
    await vi.waitFor(() => {
      expect(fakeDecoderInstances[0]?.decodeCalls).toHaveLength(1);
    });

    const firstStaleController = new AbortController();
    const firstStale = owner.decodeTexture(
      h264Frame({
        hasParameterSets: false,
        keyframe: false,
        timestampNs: 2_000n,
      }),
      [],
      firstStaleController.signal,
    );
    const secondStaleController = new AbortController();
    const secondStale = owner.decodeTexture(
      h264Frame({
        hasParameterSets: false,
        keyframe: false,
        timestampNs: 3_000n,
      }),
      [],
      secondStaleController.signal,
    );
    const firstStaleExpectation =
      expect(firstStale).rejects.toThrow("superseded");
    const secondStaleExpectation =
      expect(secondStale).rejects.toThrow("superseded");
    secondStaleController.abort();
    firstStaleController.abort();
    const latest = owner.decodeTexture(
      h264Frame({
        hasParameterSets: false,
        keyframe: false,
        timestampNs: 4_000n,
      }),
    );
    await Promise.all([firstStaleExpectation, secondStaleExpectation]);
    expect(fakeDecoderInstances[0].decodeCalls).toHaveLength(1);

    fakeDecoderInstances[0].outputNext();
    const firstHandle = await first;
    await vi.waitFor(() => {
      expect(fakeDecoderInstances[0].decodeCalls).toHaveLength(4);
    });
    expect(
      fakeDecoderInstances[0].decodeCalls
        .slice(1)
        .map((call) => call.timestamp),
    ).toEqual([2, 3, 4]);
    fakeDecoderInstances[0].outputNext();
    fakeDecoderInstances[0].outputNext();
    fakeDecoderInstances[0].outputNext();
    const latestHandle = await latest;

    firstHandle.dispose();
    latestHandle.dispose();
    owner.release();
  });

  it("bounds batch submission and treats decoded outputs as timeout progress", async () => {
    vi.useFakeTimers();
    FakeVideoDecoder.decodeBehavior = "hold";
    const keyframe = h264Frame({ keyframe: true, timestampNs: 1_000n });
    const runway = [
      keyframe,
      ...Array.from({ length: 8 }, (_, index) =>
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
      timestampNs: 10_000n,
    });
    const owner = acquireEncodedVideoSession(
      target,
      "rec\n/camera/video\n10000",
    );
    const texture = owner.decodeTexture(target, runway);
    await vi.advanceTimersByTimeAsync(0);

    const decoder = fakeDecoderInstances[0];
    expect(decoder.decodeCalls).toHaveLength(8);
    await vi.advanceTimersByTimeAsync(2_500);
    decoder.outputNext();
    await vi.advanceTimersByTimeAsync(2_500);
    for (let index = 0; index < 7; index += 1) decoder.outputNext();
    await Promise.resolve();
    await Promise.resolve();
    expect(decoder.decodeCalls).toHaveLength(10);

    await vi.advanceTimersByTimeAsync(2_500);
    decoder.outputNext();
    await vi.advanceTimersByTimeAsync(2_500);
    decoder.outputNext();
    const handle = await texture;

    expect(decoder.resetCalls).toBe(0);
    handle.dispose();
    owner.release();
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
      "Timed out waiting for H.264 decode progress",
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

  it("never closes active work when a seventh live stream reaches the cap", async () => {
    stubVideoCanvasContext();
    FakeVideoDecoder.decodeBehavior = "hold";
    const owners = Array.from(
      { length: VIDEO_DECODE_SESSION_CAP + 1 },
      (_, index) => {
        const frame = h264Frame({
          keyframe: true,
          timestampNs: BigInt(index + 1),
        });
        const key = `rec\n/camera/${index}\n${index}`;
        return {
          frame,
          owner: acquireEncodedVideoSession(frame, key),
        };
      },
    );

    const canvases = owners.map(({ frame, owner }) =>
      owner.decodeCanvas(frame),
    );
    await vi.waitFor(() =>
      expect(fakeDecoderInstances).toHaveLength(VIDEO_DECODE_SESSION_CAP),
    );
    expect(videoTextureDecoderStats()).toMatchObject({
      decoderSlotCount: VIDEO_DECODE_SESSION_CAP,
      ownerCount: VIDEO_DECODE_SESSION_CAP + 1,
      sessionCount: VIDEO_DECODE_SESSION_CAP + 1,
      waitingSessionCount: 1,
    });
    expect(
      fakeDecoderInstances.every((decoder) => decoder.closeCalls === 0),
    ).toBe(true);

    fakeDecoderInstances[0].outputNext();
    await canvases[0];
    await vi.waitFor(() =>
      expect(fakeDecoderInstances).toHaveLength(VIDEO_DECODE_SESSION_CAP + 1),
    );
    expect(fakeDecoderInstances[0].closeCalls).toBe(1);
    expect(
      fakeDecoderInstances
        .slice(1)
        .every((decoder) => decoder.closeCalls === 0),
    ).toBe(true);

    for (let index = 1; index < fakeDecoderInstances.length; index += 1) {
      fakeDecoderInstances[index].outputNext();
    }
    await Promise.all(canvases.slice(1));

    const resumed = owners[0].owner.decodeCanvas(
      h264Frame({
        bytes: Uint8Array.of(0, 0, 1, 0x41, 0xc0),
        hasParameterSets: false,
        keyframe: false,
        timestampNs: 1_000n,
      }),
    );
    await vi.waitFor(() =>
      expect(fakeDecoderInstances).toHaveLength(VIDEO_DECODE_SESSION_CAP + 2),
    );
    expect(
      fakeDecoderInstances[VIDEO_DECODE_SESSION_CAP + 1].decodeCalls.map(
        (call) => call.type,
      ),
    ).toEqual(["key", "delta"]);
    fakeDecoderInstances[VIDEO_DECODE_SESSION_CAP + 1].outputNext();
    fakeDecoderInstances[VIDEO_DECODE_SESSION_CAP + 1].outputNext();
    await resumed;

    for (const { owner } of owners) owner.release();
  });

  it("cleans up only the ended source while preserving shared owners", async () => {
    stubVideoCanvasContext();
    const frameA = h264Frame({ keyframe: true, timestampNs: 1_000n });
    const frameB = h264Frame({ keyframe: true, timestampNs: 2_000n });
    const ownerA1 = acquireEncodedVideoSession(frameA, "source-a\n/camera\n1");
    const ownerA2 = acquireEncodedVideoSession(frameA, "source-a\n/camera\n2");
    const ownerB = acquireEncodedVideoSession(frameB, "source-b\n/camera\n2");
    await Promise.all([
      ownerA1.decodeCanvas(frameA),
      ownerB.decodeCanvas(frameB),
    ]);

    expect(fakeDecoderInstances).toHaveLength(2);
    expect(videoTextureDecoderStats()).toMatchObject({
      ownerCount: 3,
      sessionCount: 2,
    });
    releaseEncodedVideoSessionsForSource("source-a");

    expect(fakeDecoderInstances[0].closeCalls).toBe(1);
    expect(fakeDecoderInstances[1].closeCalls).toBe(0);
    expect(videoTextureDecoderStats()).toMatchObject({
      ownerCount: 1,
      sessionCount: 1,
    });
    ownerA1.release();
    ownerA2.release();
    ownerB.release();
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

  outputAtTimestamp(timestamp: number): FakeFrame {
    const frame = {
      close: vi.fn(),
      displayHeight: 480,
      displayWidth: 640,
      timestamp,
    };
    this.outputFrames.push(frame);
    this.init.output(frame);
    return frame;
  }

  reset(): void {
    this.resetCalls += 1;
  }

  fail(error: Error): void {
    this.init.error(error);
  }
}
