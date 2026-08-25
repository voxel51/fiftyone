import { afterEach, describe, expect, it, vi } from "vitest";

import type { EncodedH264VideoVisualization } from "../ir";
import { VISUALIZATION_KIND } from "../ir";
import type { H264AccessUnit } from "./types";
import { VideoDecoderFailureError, VideoIntentCancelledError } from "./types";
import {
  MAX_VIDEO_DECODE_IN_FLIGHT,
  VIDEO_DECODE_PROGRESS_TIMEOUT_MS,
  WebCodecsH264Decoder,
  type WebCodecsDecoderEnvironment,
} from "./webcodecs-decoder";

describe("WebCodecsH264Decoder", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("decodes a slow 1,024-frame GOP with bounded submission and no reset storm", async () => {
    const harness = fakeWebCodecs();
    const actor = new WebCodecsH264Decoder(harness.environment);
    const units = Array.from({ length: 1_025 }, (_, index) =>
      unit(index, index === 0),
    );

    const output = await actor.decode(units, {
      signal: new AbortController().signal,
      targetTimeNs: 1_024n,
    });

    expect(harness.maxOutstanding()).toBe(MAX_VIDEO_DECODE_IN_FLIGHT);
    expect(harness.instances).toHaveLength(1);
    expect(harness.instances[0].decode).toHaveBeenCalledTimes(1_025);
    expect(harness.instances[0].reset).not.toHaveBeenCalled();
    expect(harness.frames.slice(0, -1).every((frame) => frame.closed())).toBe(
      true,
    );
    expect(harness.frames.at(-1)?.closed()).toBe(false);
    output.close();
    actor.close();
  });

  it("reconfigures only at a keyframe configuration epoch", async () => {
    const harness = fakeWebCodecs();
    const actor = new WebCodecsH264Decoder(harness.environment);
    await actor.decode([unit(0, true, "avc1.4D001F")], {
      signal: new AbortController().signal,
      targetTimeNs: 0n,
    });
    await actor.decode([unit(1, false, "avc1.640028")], {
      signal: new AbortController().signal,
      targetTimeNs: 1n,
    });
    await actor.decode([unit(2, true, "avc1.640028")], {
      signal: new AbortController().signal,
      targetTimeNs: 2n,
    });

    expect(harness.instances).toHaveLength(2);
    expect(harness.instances[0].reset).toHaveBeenCalledOnce();
    expect(harness.instances[0].close).toHaveBeenCalledOnce();
    expect(harness.instances[1].configure).toHaveBeenCalledWith(
      expect.objectContaining({ codec: "avc1.640028" }),
    );
    actor.close();
  });

  it("splits one runway before an in-batch codec configuration boundary", async () => {
    const harness = fakeWebCodecs();
    const actor = new WebCodecsH264Decoder(harness.environment);
    const output = await actor.decode(
      [unit(0, true, "avc1.4D001F"), unit(1), unit(2, true, "avc1.640028")],
      {
        signal: new AbortController().signal,
        targetTimeNs: 2n,
      },
    );

    expect(harness.instances).toHaveLength(2);
    expect(harness.instances[0].decode).toHaveBeenCalledTimes(2);
    expect(harness.instances[1].decode).toHaveBeenCalledTimes(1);
    expect(harness.instances[1].configure).toHaveBeenCalledWith(
      expect.objectContaining({ codec: "avc1.640028" }),
    );
    output.close();
    actor.close();
  });

  it("treats supersession as cancellation without resetting the decoder", async () => {
    const outputGate = deferred<void>();
    const harness = fakeWebCodecs({ outputGate: outputGate.promise });
    const actor = new WebCodecsH264Decoder(harness.environment);
    const controller = new AbortController();
    const decode = actor.decode(
      [
        unit(0, true),
        ...Array.from({ length: 20 }, (_, index) => unit(index + 1)),
      ],
      { signal: controller.signal, targetTimeNs: 20n },
    );
    await vi.waitFor(() =>
      expect(harness.instances[0].decode).toHaveBeenCalledTimes(
        MAX_VIDEO_DECODE_IN_FLIGHT,
      ),
    );
    controller.abort();
    outputGate.resolve();

    await expect(decode).rejects.toBeInstanceOf(VideoIntentCancelledError);
    expect(harness.instances[0].reset).not.toHaveBeenCalled();
    expect(harness.instances[0].decode).toHaveBeenCalledTimes(
      MAX_VIDEO_DECODE_IN_FLIGHT,
    );
    actor.close();
  });

  it("uses unique submission timestamps without losing nanosecond cursor time", async () => {
    const harness = fakeWebCodecs();
    const actor = new WebCodecsH264Decoder(harness.environment);
    const output = await actor.decode([unit(1_000, true), unit(1_999)], {
      signal: new AbortController().signal,
      targetTimeNs: 1_999n,
    });

    const timestamps = harness.instances[0].decode.mock.calls.map(
      ([chunk]) => (chunk as { readonly timestamp: number }).timestamp,
    );
    expect(timestamps).toEqual([1, 2]);
    expect(actor.cursorTimeNs).toBe(1_999n);
    output.close();
    actor.close();
  });

  it("submits B-frames in decode order while preserving presentation timestamps", async () => {
    const harness = fakeWebCodecs();
    const actor = new WebCodecsH264Decoder(harness.environment);
    const output = await actor.decode(
      [
        unit(0, true, "avc1.4D001F", 0),
        unit(1_000_000, false, undefined, 2_000_000),
        unit(2_000_000, false, undefined, 1_000_000),
      ],
      {
        signal: new AbortController().signal,
        targetTimeNs: 1_000_000n,
      },
    );

    expect(
      harness.instances[0].decode.mock.calls.map(
        ([chunk]) => (chunk as { readonly timestamp: number }).timestamp,
      ),
    ).toEqual([0, 2_000, 1_000]);
    expect(harness.instances[0].flush).not.toHaveBeenCalled();
    output.close();
    actor.close();
  });

  it("reuses a decoded future B-frame without flushing or resubmitting it", async () => {
    const harness = fakeWebCodecs();
    const actor = new WebCodecsH264Decoder(harness.environment);
    const keyframe = unit(0, true, "avc1.4D001F", 0);
    const futurePresentation = unit(2_000_000, false, undefined, 1_000_000);
    const target = unit(1_000_000, false, undefined, 2_000_000);

    expect(actor.hasReadyPresentation(futurePresentation.timeNs)).toBe(false);
    const first = await actor.decode([keyframe, futurePresentation, target], {
      signal: new AbortController().signal,
      targetTimeNs: target.timeNs,
    });
    first.close();
    expect(actor.hasReadyPresentation(futurePresentation.timeNs)).toBe(true);
    const second = await actor.decode([futurePresentation], {
      signal: new AbortController().signal,
      targetTimeNs: futurePresentation.timeNs,
    });

    expect(harness.instances[0].decode).toHaveBeenCalledTimes(3);
    expect(harness.instances[0].flush).not.toHaveBeenCalled();
    expect(actor.cursorTimeNs).toBe(futurePresentation.timeNs);
    expect(actor.hasReadyPresentation(futurePresentation.timeNs)).toBe(false);
    second.close();
    actor.close();
  });

  it("feeds reorder successors before awaiting an opening keyframe", async () => {
    const harness = fakeWebCodecs({ holdOutputsUntilSubmissions: 2 });
    const actor = new WebCodecsH264Decoder(harness.environment);
    const output = await actor.decode(
      [
        unit(0, true, "avc1.4D001F", 0),
        unit(1_000_000, false, undefined, 1_000_000),
      ],
      {
        signal: new AbortController().signal,
        targetTimeNs: 0n,
      },
    );

    expect(harness.instances[0].decode).toHaveBeenCalledTimes(2);
    expect(harness.instances[0].flush).not.toHaveBeenCalled();
    output.close();
    actor.close();
  });

  it("keeps feeding a decoder that retains more outputs than the queue limit", async () => {
    const retainedOutputs = MAX_VIDEO_DECODE_IN_FLIGHT + 4;
    const harness = fakeWebCodecs({
      holdOutputsUntilSubmissions: retainedOutputs,
    });
    const actor = new WebCodecsH264Decoder(harness.environment);
    const units = Array.from({ length: retainedOutputs }, (_, index) =>
      unit(index, index === 0, undefined, index),
    );

    const output = await actor.decode(units, {
      signal: new AbortController().signal,
      targetTimeNs: BigInt(retainedOutputs - 1),
    });

    expect(harness.instances[0].decode).toHaveBeenCalledTimes(retainedOutputs);
    expect(harness.maxDecodeQueueSize()).toBe(MAX_VIDEO_DECODE_IN_FLIGHT);
    expect(harness.instances[0].flush).not.toHaveBeenCalled();
    output.close();
    actor.close();
  });

  it("fails stalled B-frame progress at the transaction boundary", async () => {
    vi.useFakeTimers();
    const harness = fakeWebCodecs({ shouldOutput: () => false });
    const actor = new WebCodecsH264Decoder(harness.environment);
    const decode = actor.decode([unit(0, true, undefined, 0)], {
      signal: new AbortController().signal,
      targetTimeNs: 0n,
    });
    const rejection = expect(decode).rejects.toBeInstanceOf(
      VideoDecoderFailureError,
    );

    await vi.advanceTimersByTimeAsync(VIDEO_DECODE_PROGRESS_TIMEOUT_MS + 1);
    await rejection;
    expect(harness.instances[0].reset).toHaveBeenCalledOnce();
    expect(harness.instances[0].close).toHaveBeenCalledOnce();
    actor.close();
  });

  it("rejects insecure contexts with a typed decoder failure", async () => {
    const harness = fakeWebCodecs({ isSecureContext: false });
    const actor = new WebCodecsH264Decoder(harness.environment);

    await expect(
      actor.decode([unit(0, true)], {
        signal: new AbortController().signal,
        targetTimeNs: 0n,
      }),
    ).rejects.toThrow("requires a secure context");
    expect(harness.instances).toHaveLength(0);
    actor.close();
  });

  it("reports unsupported codec configuration with the codec string", async () => {
    const harness = fakeWebCodecs({ supported: false });
    const actor = new WebCodecsH264Decoder(harness.environment);

    await expect(
      actor.decode([unit(0, true, "avc1.640028")], {
        signal: new AbortController().signal,
        targetTimeNs: 0n,
      }),
    ).rejects.toMatchObject({
      message: "H.264 codec 'avc1.640028' is unsupported",
      name: "VideoDecoderFailureError",
    });
    actor.close();
  });

  it("still closes a decoder whose reset throws", async () => {
    const harness = fakeWebCodecs();
    const actor = new WebCodecsH264Decoder(harness.environment);
    const output = await actor.decode([unit(0, true)], {
      signal: new AbortController().signal,
      targetTimeNs: 0n,
    });
    output.close();
    harness.instances[0].reset.mockImplementationOnce(() => {
      throw new Error("already reset");
    });

    actor.resetForDiscontinuity();
    expect(harness.instances[0].close).toHaveBeenCalledOnce();
    actor.close();
  });

  it("closes explicit source ownership without an unnecessary reset", async () => {
    const harness = fakeWebCodecs();
    const actor = new WebCodecsH264Decoder(harness.environment);
    const output = await actor.decode([unit(0, true)], {
      signal: new AbortController().signal,
      targetTimeNs: 0n,
    });
    output.close();

    actor.close();
    expect(harness.instances[0].reset).not.toHaveBeenCalled();
    expect(harness.instances[0].close).toHaveBeenCalledOnce();
  });

  it("fails stalled progress and closes an already-retained output", async () => {
    vi.useFakeTimers();
    const harness = fakeWebCodecs({
      shouldOutput: (submission) => submission === 0,
    });
    const actor = new WebCodecsH264Decoder(harness.environment);
    const decode = actor.decode([unit(0, true), unit(1)], {
      signal: new AbortController().signal,
      targetTimeNs: 0n,
    });
    const rejection = expect(decode).rejects.toBeInstanceOf(
      VideoDecoderFailureError,
    );

    await vi.advanceTimersByTimeAsync(VIDEO_DECODE_PROGRESS_TIMEOUT_MS + 1);
    await rejection;
    expect(harness.frames).toHaveLength(1);
    expect(harness.frames[0].closed()).toBe(true);
    expect(harness.instances[0].reset).toHaveBeenCalledOnce();
    expect(harness.instances[0].close).toHaveBeenCalledOnce();
    actor.close();
  });
});

function fakeWebCodecs(
  options: {
    readonly holdOutputsUntilSubmissions?: number;
    readonly isSecureContext?: boolean;
    readonly outputGate?: Promise<void>;
    readonly shouldOutput?: (submission: number) => boolean;
    readonly supported?: boolean;
  } = {},
) {
  let outstanding = 0;
  let maximumOutstanding = 0;
  let maximumDecodeQueueSize = 0;
  const frames: Array<{
    readonly closed: () => boolean;
    readonly frame: VideoFrame;
  }> = [];
  const queuedOutputs: Array<{
    readonly decoder: FakeDecoder;
    readonly chunk: FakeChunk;
  }> = [];
  const instances: Array<{
    readonly close: ReturnType<typeof vi.fn>;
    readonly configure: ReturnType<typeof vi.fn>;
    readonly decode: ReturnType<typeof vi.fn>;
    readonly flush: ReturnType<typeof vi.fn>;
    readonly reset: ReturnType<typeof vi.fn>;
  }> = [];

  class FakeChunk {
    readonly timestamp: number;
    readonly type: "key" | "delta";

    constructor(init: EncodedVideoChunkInit) {
      this.timestamp = init.timestamp;
      this.type = init.type;
    }
  }

  class FakeDecoder {
    static isConfigSupported = vi.fn(async (config: VideoDecoderConfig) => ({
      config,
      supported: options.supported ?? true,
    }));
    readonly close = vi.fn();
    readonly configure = vi.fn();
    decodeQueueSize = 0;
    readonly decode = vi.fn((chunk: FakeChunk) => {
      if (this.keyRequired && chunk.type !== "key") {
        throw new DOMException("A key chunk is required", "DataError");
      }
      this.keyRequired = false;
      const submission = this.decode.mock.calls.length - 1;
      this.decodeQueueSize += 1;
      maximumDecodeQueueSize = Math.max(
        maximumDecodeQueueSize,
        this.decodeQueueSize,
      );
      queueMicrotask(() => {
        this.decodeQueueSize -= 1;
        for (const listener of this.dequeueListeners) {
          listener.call(this, new Event("dequeue"));
        }
      });
      outstanding += 1;
      maximumOutstanding = Math.max(maximumOutstanding, outstanding);
      if (options.shouldOutput && !options.shouldOutput(submission)) return;
      queuedOutputs.push({ chunk, decoder: this });
      if (
        this.decode.mock.calls.length <
        (options.holdOutputsUntilSubmissions ?? 1)
      ) {
        return;
      }
      for (const queued of queuedOutputs.splice(0)) {
        void Promise.resolve(options.outputGate).then(() => {
          outstanding -= 1;
          let closed = false;
          const frame = {
            close: () => {
              closed = true;
            },
            codedHeight: 480,
            codedWidth: 640,
            displayHeight: 480,
            displayWidth: 640,
            timestamp: queued.chunk.timestamp,
          } as unknown as VideoFrame;
          frames.push({ closed: () => closed, frame });
          queued.decoder.init.output(frame);
        });
      }
    });
    readonly flush = vi.fn(async () => {
      this.keyRequired = true;
    });
    readonly reset = vi.fn(() => {
      this.keyRequired = true;
    });
    readonly addEventListener = vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type !== "dequeue" || typeof listener !== "function") return;
        this.dequeueListeners.add(listener);
      },
    );
    readonly removeEventListener = vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type !== "dequeue" || typeof listener !== "function") return;
        this.dequeueListeners.delete(listener);
      },
    );
    private readonly dequeueListeners = new Set<EventListener>();
    private keyRequired = true;

    constructor(
      private readonly init: {
        readonly error: (error: DOMException) => void;
        readonly output: (output: VideoFrame) => void;
      },
    ) {
      instances.push(this);
    }
  }

  const environment: WebCodecsDecoderEnvironment = {
    EncodedVideoChunk: FakeChunk as unknown as typeof EncodedVideoChunk,
    VideoDecoder: FakeDecoder as unknown as typeof VideoDecoder,
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    isSecureContext: options.isSecureContext ?? true,
    setTimeout: globalThis.setTimeout.bind(globalThis),
  };
  return {
    environment,
    frames,
    instances,
    maxDecodeQueueSize: () => maximumDecodeQueueSize,
    maxOutstanding: () => maximumOutstanding,
  };
}

function unit(
  time: number,
  keyframe = false,
  codecString = keyframe ? "avc1.4D001F" : undefined,
  decodeTime?: number,
): H264AccessUnit {
  const timeNs = BigInt(time);
  return {
    frame: {
      bytes: Uint8Array.of(0, 0, 1, keyframe ? 0x65 : 0x41),
      codec: "h264",
      ...(decodeTime === undefined
        ? {}
        : { decodeTimestampNs: BigInt(decodeTime) }),
      format: "h264",
      h264: {
        ...(codecString ? { codecString } : {}),
        hasFrame: true,
        ...(keyframe
          ? {
              pps: Uint8Array.of(0x68, 0xce),
              sps: Uint8Array.of(0x67, 0x4d, 0, 0x1f),
            }
          : {}),
      },
      keyframe,
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
      timestampNs: timeNs,
    } satisfies EncodedH264VideoVisualization,
    timeNs,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
