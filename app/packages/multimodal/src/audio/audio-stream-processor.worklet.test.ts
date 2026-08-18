import { beforeAll, describe, expect, it, vi } from "vitest";
import { AudioRingBuffer } from "./ring-buffer";

// `AudioWorkletProcessor` and `registerProcessor` exist only in
// `AudioWorkletGlobalScope`. Stub them before importing the worklet so the
// real-time `process()` logic can be driven directly — otherwise the only
// way to cover it would be an e2e run with real audio hardware.
const posted: unknown[] = [];

class FakeAudioWorkletProcessor {
  readonly port = {
    postMessage: (message: unknown) => posted.push(message),
  } as unknown as MessagePort;
}

type Processor = {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};

let ProcessorCtor: new (options?: unknown) => Processor;
let AUDIO_STREAM_PROCESSOR: string;

beforeAll(async () => {
  vi.stubGlobal("AudioWorkletProcessor", FakeAudioWorkletProcessor);
  vi.stubGlobal(
    "registerProcessor",
    (_name: string, ctor: new (options?: unknown) => Processor) => {
      ProcessorCtor = ctor;
    },
  );
  const mod = await import("./audio-stream-processor.worklet");
  AUDIO_STREAM_PROCESSOR = mod.AUDIO_STREAM_PROCESSOR;
});

const CAPACITY = 512;

function harness(channels = 2) {
  const layout = {
    buffer: new SharedArrayBuffer(
      8 * 4 + CAPACITY * channels * Float32Array.BYTES_PER_ELEMENT,
    ),
    capacityFrames: CAPACITY,
    channels,
  };
  posted.length = 0;
  return {
    producer: new AudioRingBuffer(layout),
    processor: new ProcessorCtor({ processorOptions: { layout } }),
    outputs: (quantum = 128) => [
      Array.from({ length: channels }, () => new Float32Array(quantum)),
    ],
  };
}

/** Interleaved constant-per-channel frames, value = base + channel. */
function frames(count: number, channels: number, base: number): Float32Array {
  const out = new Float32Array(count * channels);
  for (let f = 0; f < count; f++) {
    for (let c = 0; c < channels; c++) out[f * channels + c] = base + c;
  }
  return out;
}

describe("audio stream worklet", () => {
  it("registers under the name the main thread constructs", () => {
    expect(AUDIO_STREAM_PROCESSOR).toBe("fo-audio-stream");
    expect(ProcessorCtor).toBeTypeOf("function");
  });

  it("refuses to construct without a ring layout rather than silently emitting silence", () => {
    expect(() => new ProcessorCtor({ processorOptions: {} })).toThrow(
      /ring buffer layout/,
    );
  });

  it("de-interleaves buffered audio onto the output bus", () => {
    const { producer, processor, outputs } = harness(2);
    producer.write(frames(128, 2, 10));

    const out = outputs(128);
    expect(processor.process([], out)).toBe(true);
    expect(out[0][0][0]).toBe(10);
    expect(out[0][1][0]).toBe(11);
    expect(out[0][0][127]).toBe(10);
  });

  it("keeps the media clock on real frames only, so it is not inflated by starvation", () => {
    const { producer, processor, outputs } = harness(2);
    producer.write(frames(64, 2, 1));

    processor.process([], outputs(128));
    // 64 real frames delivered, 64 of silence.
    expect(producer.framesPlayed()).toBe(64);
    expect(producer.underrunFrames()).toBe(64);
  });

  it("zero-fills the shortfall instead of repeating the previous quantum", () => {
    const { producer, processor, outputs } = harness(1);
    producer.write(frames(200, 1, 5));

    const first = outputs(128);
    processor.process([], first);
    expect(first[0][0][127]).toBe(5);

    // Only 72 frames remain for a 128-frame quantum.
    const second = outputs(128);
    processor.process([], second);
    expect(second[0][0][71]).toBe(5);
    expect(second[0][0][72]).toBe(0);
    expect(second[0][0][127]).toBe(0);
  });

  it("reports starvation once, not once per quantum", () => {
    const { processor, outputs } = harness(1);
    processor.process([], outputs());
    processor.process([], outputs());
    processor.process([], outputs());
    expect(
      posted.filter((m) => (m as { type: string }).type === "starved"),
    ).toHaveLength(1);
  });

  it("reports recovery when data arrives again", () => {
    const { producer, processor, outputs } = harness(1);
    processor.process([], outputs());
    expect(posted).toEqual([{ type: "starved" }]);

    producer.write(frames(128, 1, 3));
    processor.process([], outputs());
    expect(posted).toEqual([{ type: "starved" }, { type: "recovered" }]);
  });

  it("does not count end-of-stream silence as an underrun", () => {
    const { producer, processor, outputs } = harness(1);
    producer.markEnded();

    processor.process([], outputs());
    processor.process([], outputs());
    expect(producer.underrunFrames()).toBe(0);
    expect(posted).toHaveLength(0);
  });

  it("drops stale audio on the quantum after a seek", () => {
    const { producer, processor, outputs } = harness(1);
    producer.write(frames(256, 1, 7)); // audio from the old position

    const generation = producer.requestFlush();
    producer.write(frames(128, 1, 9)); // audio for the new position

    const out = outputs(128);
    processor.process([], out);
    // The pre-seek samples never reach the bus.
    expect(out[0][0][0]).toBe(9);
    expect(producer.flushAcknowledged(generation)).toBe(true);
  });

  it("restarts the clock after a seek so position is not cumulative", () => {
    const { producer, processor, outputs } = harness(1);
    producer.write(frames(128, 1, 1));
    processor.process([], outputs());
    expect(producer.framesPlayed()).toBe(128);

    producer.requestFlush();
    producer.write(frames(128, 1, 2));
    processor.process([], outputs());
    expect(producer.framesPlayed()).toBe(128);
  });

  it("stays alive at end of stream so a later seek can refill the same node", () => {
    const { producer, processor, outputs } = harness(1);
    producer.markEnded();
    expect(processor.process([], outputs())).toBe(true);
    expect(processor.process([], outputs())).toBe(true);
  });

  it("tolerates a bus with no channels rather than throwing on the render thread", () => {
    const { processor } = harness(2);
    expect(processor.process([], [[]])).toBe(true);
    expect(processor.process([], [])).toBe(true);
  });

  it("keeps remaining channels time-aligned when the bus is narrower than the ring", () => {
    const { producer, processor } = harness(2);
    producer.write(frames(4, 2, 100));
    // Mono bus against a stereo ring: channel 1 is dropped, but its samples
    // are still consumed so channel 0 does not smear across frames.
    const out = [[new Float32Array(4)]];
    processor.process([], out);
    expect(Array.from(out[0][0])).toEqual([100, 100, 100, 100]);
    expect(producer.availableRead()).toBe(0);
  });
});
