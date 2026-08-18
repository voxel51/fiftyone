// End-to-end through the real pieces: the pump produces, the ring carries,
// the worklet processor consumes. Only the window reader and the render
// thread's clock are faked — everything between them is production code.
//
// The unit tests cover each half against a stub of the other, which cannot
// catch a disagreement about the contract between them (a frame/sample
// confusion, or a flush boundary each side interprets differently). This
// drives audio all the way to the output bus and checks the samples.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { AudioRingBuffer } from "./ring-buffer";
import {
  createAudioStreamPump,
  type AudioWindowReader,
} from "./audio-stream-pump";
import type { PcmAudioData } from "./types";

class FakeAudioWorkletProcessor {
  readonly port = { postMessage: () => undefined } as unknown as MessagePort;
}

type Processor = {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};

let ProcessorCtor: new (options?: unknown) => Processor;

beforeAll(async () => {
  vi.stubGlobal("AudioWorkletProcessor", FakeAudioWorkletProcessor);
  vi.stubGlobal(
    "registerProcessor",
    (_n: string, ctor: new (options?: unknown) => Processor) => {
      ProcessorCtor = ctor;
    },
  );
  await import("./audio-stream-processor.worklet");
});

const SAMPLE_RATE = 1000;
const CHANNELS = 1;
const QUANTUM = 128;

/**
 * The engine surface the pump needs, backed by a real ring and a real
 * processor. `createAudioStreamEngine` itself is skipped only because jsdom
 * has no `AudioContext`/`AudioWorklet`; the ring and processor are real.
 */
function rig(capacityFrames = 4096) {
  const layout = {
    buffer: new SharedArrayBuffer(
      8 * 4 + capacityFrames * CHANNELS * Float32Array.BYTES_PER_ELEMENT,
    ),
    capacityFrames,
    channels: CHANNELS,
  };
  const ring = new AudioRingBuffer(layout);
  const processor = new ProcessorCtor({ processorOptions: { layout } });

  const engine = {
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    availableWrite: () => ring.availableWrite(),
    bufferedFrames: () => ring.availableRead(),
    push: (pcm: Float32Array, offsetFrames = 0) =>
      ring.write(pcm, offsetFrames),
    seek: () => {
      ring.requestFlush();
    },
    markEnded: () => ring.markEnded(),
  };

  /** Pulls `quanta` render quanta and returns every sample emitted. */
  const render = (quanta: number): number[] => {
    const out: number[] = [];
    for (let q = 0; q < quanta; q++) {
      const bus = [[new Float32Array(QUANTUM)]];
      processor.process([], bus[0] ? bus : [[]]);
      out.push(...Array.from(bus[0][0]));
    }
    return out;
  };

  return { ring, engine, render };
}

/**
 * Window whose samples count up globally, so order is verifiable. Values
 * start at 1: sample 0 would be indistinguishable from the silence the
 * worklet emits when starved, making every assertion below ambiguous.
 */
const countingReader =
  (frames: number): AudioWindowReader =>
  async (startSec) => {
    const base = Math.round(startSec * SAMPLE_RATE);
    const samples = new Float32Array(frames);
    for (let i = 0; i < frames; i++) samples[i] = base + i + 1;
    return { samples, sampleRate: SAMPLE_RATE, channels: CHANNELS };
  };

const settle = () => new Promise((r) => setTimeout(r, 0));
const immediate = () => {
  const queue: (() => void)[] = [];
  return {
    schedule: (fn: () => void) => queue.push(fn),
    async drain(rounds = 200) {
      for (let i = 0; i < rounds && queue.length; i++) {
        queue.shift()?.();
        await Promise.resolve();
      }
    },
  };
};

describe("streaming audio end to end", () => {
  it("delivers windowed reads to the output bus in order", async () => {
    const { engine, render } = rig();
    const pump = createAudioStreamPump({
      engine,
      read: countingReader(SAMPLE_RATE),
      durationSec: 2,
      windowSeconds: 1,
      schedule: immediate().schedule,
    });

    pump.start(0);
    await settle();

    // 2000 frames produced; pull 16 quanta (2048 frames) to drain them.
    const emitted = render(16);
    const audible = emitted.slice(0, 2000);
    expect(audible).toEqual(Array.from({ length: 2000 }, (_, i) => i + 1));
    // Past the end the bus is silent, not repeating the last buffer.
    expect(emitted.slice(2000).every((v) => v === 0)).toBe(true);
  });

  it("keeps the media clock equal to the audio actually emitted", async () => {
    const { ring, engine, render } = rig();
    const pump = createAudioStreamPump({
      engine,
      read: countingReader(SAMPLE_RATE),
      durationSec: 1,
      windowSeconds: 1,
      schedule: immediate().schedule,
    });

    pump.start(0);
    await settle();
    render(4); // 512 frames

    expect(ring.framesPlayed()).toBe(512);
    expect(ring.underrunFrames()).toBe(0);
  });

  it("loses no samples when the ring is smaller than the media", async () => {
    // Ring holds 512 frames; the source is 4000. Every sample must still
    // arrive exactly once, in order, across repeated drain/refill cycles.
    const { engine, render } = rig(512);
    const scheduler = immediate();
    const pump = createAudioStreamPump({
      engine,
      read: countingReader(SAMPLE_RATE),
      durationSec: 4,
      windowSeconds: 1,
      schedule: scheduler.schedule,
    });

    pump.start(0);
    const collected: number[] = [];
    for (let round = 0; round < 60; round++) {
      await settle();
      await scheduler.drain(5);
      collected.push(...render(2));
    }

    // 0 is silence, never a sample value — see `countingReader`.
    const audible = collected.filter((v) => v !== 0);
    const expected = Array.from({ length: 4000 }, (_, i) => i + 1);
    expect(audible).toEqual(expected);
  });

  it("plays the new position after a seek, never the audio left behind", async () => {
    const { engine, render } = rig();
    const scheduler = immediate();
    const pump = createAudioStreamPump({
      engine,
      read: countingReader(SAMPLE_RATE),
      durationSec: 100,
      windowSeconds: 1,
      schedule: scheduler.schedule,
    });

    pump.start(0);
    await settle();

    pump.seek(50);
    await settle();
    // The ring is still full of pre-seek audio, and the producer cannot
    // refill until the render thread acknowledges the flush. That ack
    // happens inside `process()`, so a quantum has to run first — this is
    // the real post-seek sequence, not a test artifact.
    render(1);
    await scheduler.drain();
    await settle();

    const emitted = render(4).filter((v) => v !== 0);
    expect(emitted.length).toBeGreaterThan(0);
    expect(Math.min(...emitted)).toBeGreaterThan(50 * SAMPLE_RATE);
  });

  it("restarts the clock at the seek target so position is not cumulative", async () => {
    const { ring, engine, render } = rig();
    const pump = createAudioStreamPump({
      engine,
      read: countingReader(SAMPLE_RATE),
      durationSec: 100,
      windowSeconds: 1,
      schedule: immediate().schedule,
    });

    pump.start(0);
    await settle();
    render(2);
    expect(ring.framesPlayed()).toBe(256);

    pump.seek(10);
    await settle();
    render(2);
    // Not 512: the clock restarts at the seek target. The first of these two
    // quanta consumes the flush, so only the second carries audio.
    expect(ring.framesPlayed()).toBeLessThanOrEqual(256);
    expect(ring.framesPlayed()).toBeGreaterThan(0);
  });

  it("emits silence without counting underruns once the media ends", async () => {
    const { ring, engine, render } = rig();
    const pump = createAudioStreamPump({
      engine,
      read: countingReader(100),
      durationSec: 0.1,
      windowSeconds: 1,
      schedule: immediate().schedule,
    });

    pump.start(0);
    await settle();

    render(8); // far past the 100 available frames
    expect(ring.hasEnded()).toBe(true);
    expect(ring.underrunFrames()).toBe(0);
    expect(ring.framesPlayed()).toBe(100);
  });

  it("counts underruns when the producer is too slow, not when it is done", async () => {
    const { ring, engine, render } = rig();
    // Reader never resolves: the pump is starved, not finished.
    const pump = createAudioStreamPump({
      engine,
      read: () => new Promise<PcmAudioData>(() => undefined),
      durationSec: 100,
      windowSeconds: 1,
      schedule: immediate().schedule,
    });

    pump.start(0);
    await settle();
    render(2);

    expect(ring.hasEnded()).toBe(false);
    expect(ring.underrunFrames()).toBe(2 * QUANTUM);
    expect(ring.framesPlayed()).toBe(0);
  });
});
