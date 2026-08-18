import { describe, expect, it, vi } from "vitest";
import {
  createAudioStreamPump,
  type AudioWindowReader,
} from "./audio-stream-pump";
import type { PcmAudioData } from "./types";

const SAMPLE_RATE = 100; // small, so window math is readable
const CHANNELS = 1;

/**
 * Records what the pump pushes. `capacity` is in frames; `push` honors it
 * and reports short writes so backpressure is exercised for real rather
 * than assumed away by an infinite sink.
 */
function fakeEngine(capacity = 1_000_000) {
  const pushed: number[] = [];
  let seeks = 0;
  let ended = 0;
  let room = capacity;
  return {
    pushed,
    get seeks() {
      return seeks;
    },
    get ended() {
      return ended;
    },
    setRoom(frames: number) {
      room = frames;
    },
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    availableWrite: () => room,
    push: (interleaved: Float32Array, offsetFrames = 0) => {
      const total = Math.floor(interleaved.length / CHANNELS);
      const accepted = Math.max(0, Math.min(total - offsetFrames, room));
      for (let f = 0; f < accepted; f++) {
        pushed.push(interleaved[(offsetFrames + f) * CHANNELS]);
      }
      room -= accepted;
      return accepted;
    },
    seek: () => {
      seeks += 1;
    },
    markEnded: () => {
      ended += 1;
    },
  };
}

/** Window whose every sample equals its start second, for provenance. */
function windowOf(startSec: number, frames: number): PcmAudioData {
  return {
    samples: new Float32Array(frames).fill(startSec),
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
  };
}

/** Runs scheduled callbacks eagerly so tests need no real timers. */
function immediateScheduler() {
  const queue: (() => void)[] = [];
  return {
    schedule: (fn: () => void) => queue.push(fn),
    async flush(rounds = 20) {
      for (let i = 0; i < rounds && queue.length > 0; i++) {
        const next = queue.shift();
        next?.();
        await Promise.resolve();
      }
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("audio stream pump", () => {
  it("reads consecutive windows and pushes them in order", async () => {
    const engine = fakeEngine();
    const scheduler = immediateScheduler();
    const read: AudioWindowReader = vi.fn(async (startSec) =>
      windowOf(startSec, SAMPLE_RATE),
    );

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 3,
      windowSeconds: 1,
      schedule: scheduler.schedule,
    });
    pump.start(0);
    await settle();

    // Windows starting at 0, 1, 2 — each 100 frames tagged with its start.
    expect(engine.pushed.length).toBe(300);
    expect(engine.pushed[0]).toBe(0);
    expect(engine.pushed[100]).toBe(1);
    expect(engine.pushed[200]).toBe(2);
    expect(engine.ended).toBeGreaterThan(0);
  });

  it("does not read past the media duration", async () => {
    const engine = fakeEngine();
    const reads: Array<[number, number]> = [];
    const read: AudioWindowReader = async (startSec, endSec) => {
      reads.push([startSec, endSec]);
      return windowOf(startSec, Math.round((endSec - startSec) * SAMPLE_RATE));
    };

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 2.5,
      windowSeconds: 1,
      schedule: immediateScheduler().schedule,
    });
    pump.start(0);
    await settle();

    expect(reads).toEqual([
      [0, 1],
      [1, 2],
      [2, 2.5],
    ]);
    expect(pump.ended()).toBe(true);
  });

  it("retains the remainder of a short push instead of dropping samples", async () => {
    const engine = fakeEngine(150); // room for 1.5 windows
    const scheduler = immediateScheduler();
    const read: AudioWindowReader = async (startSec) =>
      windowOf(startSec, SAMPLE_RATE);

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 3,
      windowSeconds: 1,
      schedule: scheduler.schedule,
    });
    pump.start(0);
    await settle();

    expect(engine.pushed.length).toBe(150);
    // Drain and let the pump resume; the retained 50 frames land next.
    engine.setRoom(1000);
    await scheduler.flush();
    await settle();

    expect(engine.pushed.length).toBeGreaterThan(150);
    // Frame 150 is the second half of the window that started at 1 — the
    // retained remainder, not a re-read of window 0.
    expect(engine.pushed[150]).toBe(1);
  });

  it("discards a read that resolves after a seek", async () => {
    const engine = fakeEngine();
    // Definite-assignment: TS cannot see the assignment inside the executor
    // below, so a `| null` union would narrow to `null` at the call site.
    let release!: (value: PcmAudioData) => void;
    const read: AudioWindowReader = (startSec) =>
      startSec === 0
        ? new Promise<PcmAudioData>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(windowOf(startSec, SAMPLE_RATE));

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 10,
      windowSeconds: 1,
      schedule: immediateScheduler().schedule,
    });
    pump.start(0);
    await settle();
    expect(engine.pushed).toHaveLength(0);

    pump.seek(5);
    await settle();

    // The stale window resolves only now; its samples must not be queued.
    release(windowOf(0, SAMPLE_RATE));
    await settle();

    expect(engine.seeks).toBe(1);
    expect(engine.pushed.every((v) => v >= 5)).toBe(true);
    expect(engine.pushed).not.toHaveLength(0);
  });

  it("aborts the in-flight read on seek", async () => {
    const engine = fakeEngine();
    const signals: AbortSignal[] = [];
    const read: AudioWindowReader = (startSec, _endSec, signal) => {
      signals.push(signal);
      return startSec === 0
        ? new Promise<PcmAudioData>(() => undefined)
        : Promise.resolve(windowOf(startSec, SAMPLE_RATE));
    };

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 10,
      windowSeconds: 1,
      schedule: immediateScheduler().schedule,
    });
    pump.start(0);
    await settle();
    expect(signals[0].aborted).toBe(false);

    pump.seek(4);
    expect(signals[0].aborted).toBe(true);
  });

  it("restarts from the seek target rather than the old cursor", async () => {
    const engine = fakeEngine();
    const read: AudioWindowReader = async (startSec) =>
      windowOf(startSec, SAMPLE_RATE);

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 10,
      windowSeconds: 1,
      schedule: immediateScheduler().schedule,
    });
    pump.start(0);
    await settle();
    const before = engine.pushed.length;

    pump.seek(7);
    await settle();

    expect(engine.pushed[before]).toBe(7);
  });

  it("clears end-of-stream when seeking backwards out of it", async () => {
    const engine = fakeEngine();
    const read: AudioWindowReader = async (startSec) =>
      windowOf(startSec, SAMPLE_RATE);

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 2,
      windowSeconds: 1,
      schedule: immediateScheduler().schedule,
    });
    pump.start(0);
    await settle();
    expect(pump.ended()).toBe(true);

    pump.seek(0);
    await settle();
    // Reached the end again after replaying, but it did resume.
    expect(engine.pushed.length).toBeGreaterThan(200);
  });

  it("treats an empty read as end of stream rather than looping forever", async () => {
    const engine = fakeEngine();
    const read: AudioWindowReader = vi.fn(async () => null);

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 100,
      windowSeconds: 1,
      schedule: immediateScheduler().schedule,
    });
    pump.start(0);
    await settle();

    expect(read).toHaveBeenCalledTimes(1);
    expect(pump.ended()).toBe(true);
    expect(engine.ended).toBeGreaterThan(0);
  });

  it("surfaces a reader failure and stops instead of spinning", async () => {
    const engine = fakeEngine();
    const onError = vi.fn();
    const read: AudioWindowReader = async () => {
      throw new Error("read blew up");
    };

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 10,
      windowSeconds: 1,
      schedule: immediateScheduler().schedule,
      onError,
    });
    pump.start(0);
    await settle();

    expect(onError).toHaveBeenCalledOnce();
    expect(pump.ended()).toBe(true);
  });

  it("stops reading once stopped", async () => {
    const engine = fakeEngine();
    const read = vi.fn<AudioWindowReader>(async (startSec) =>
      windowOf(startSec, SAMPLE_RATE),
    );

    const pump = createAudioStreamPump({
      engine,
      read,
      durationSec: 100,
      windowSeconds: 1,
      schedule: immediateScheduler().schedule,
    });
    pump.stop();
    pump.start(0);
    await settle();

    expect(read).not.toHaveBeenCalled();
  });
});
