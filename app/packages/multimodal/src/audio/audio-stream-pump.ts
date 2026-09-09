// ---------------------------------------------------------------------------
// Producer loop: keeps the ring fed from windowed reads.
//
// Container-neutral by construction — it drives an injected
// `AudioWindowReader`, so the MCAP paging lives in the view layer and a
// .wav fetch or a test double works here unchanged.
//
// The loop is demand-driven rather than a timer poll: it reads the next
// window only when the ring has room, then waits for the render thread to
// drain roughly half the buffer before looking again. A fixed-interval poll
// would either spin needlessly on a full ring or starve a fast one.
// ---------------------------------------------------------------------------

import type { AudioStreamEngine } from "./audio-stream-engine";
import type { PcmAudioData } from "./types";

/**
 * Reads interleaved PCM covering `[startSec, endSec)`. Returns `null` when
 * the range holds no audio, which ends the stream.
 */
export type AudioWindowReader = (
  startSec: number,
  endSec: number,
  signal: AbortSignal,
) => Promise<PcmAudioData | null>;

export interface AudioStreamPumpOptions {
  readonly engine: Pick<
    AudioStreamEngine,
    | "push"
    | "availableWrite"
    | "bufferedFrames"
    | "seek"
    | "markEnded"
    | "sampleRate"
    | "channels"
  >;
  readonly read: AudioWindowReader;
  /** Total media duration; the pump stops reading past it. */
  readonly durationSec: number;
  /** Span of one read. Smaller means finer seek granularity, more reads. */
  readonly windowSeconds?: number;
  /** Injected for tests; defaults to `setTimeout`. */
  readonly schedule?: (fn: () => void, delayMs: number) => void;
  readonly onError?: (error: unknown) => void;
}

export interface AudioStreamPump {
  /** Begins filling from `fromSec`. Idempotent. */
  start(fromSec: number): void;
  /** Repositions: discards queued audio and refills from `toSec`. */
  seek(toSec: number): void;
  /** True once the reader has reported the end of the media. */
  ended(): boolean;
  stop(): void;
}

const DEFAULT_WINDOW_SECONDS = 1;

export function createAudioStreamPump({
  engine,
  read,
  durationSec,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
  schedule = (fn, delayMs) => {
    setTimeout(fn, delayMs);
  },
  onError,
}: AudioStreamPumpOptions): AudioStreamPump {
  const { sampleRate, channels } = engine;

  let controller: AbortController | null = null;
  let running = false;
  let stopped = false;
  let atEnd = false;
  /** Next media second to read from. */
  let cursorSec = 0;
  /**
   * Frames read but not yet accepted by the ring. A short `push` must not
   * drop the remainder or audio would silently lose a slice.
   */
  let pending: Float32Array | null = null;
  let pendingOffsetFrames = 0;
  /**
   * Incremented on every seek. An in-flight read that resolves after a seek
   * belongs to the old position and is discarded by comparing this — the
   * abort signal alone is not enough, because a reader may resolve normally
   * before it observes the abort.
   */
  let generation = 0;

  const drainPending = (): boolean => {
    if (!pending) return true;
    const accepted = engine.push(pending, pendingOffsetFrames);
    pendingOffsetFrames += accepted;
    const total = Math.floor(pending.length / channels);
    if (pendingOffsetFrames >= total) {
      pending = null;
      pendingOffsetFrames = 0;
      return true;
    }
    return false;
  };

  /**
   * Back off in proportion to the runway the render thread still has. This
   * must key off buffered audio, not free space: those are inverses, and
   * using free space would sleep longest exactly when the ring is empty and
   * about to underrun.
   */
  const waitAndResume = () => {
    if (stopped) return;
    const bufferedSec = Math.max(0, engine.bufferedFrames()) / sampleRate;
    // Re-check after roughly half the runway is gone. The floor keeps a
    // still-full ring from spinning; the ceiling bounds seek latency when
    // the ring is full and waiting on the render thread's flush ack.
    const delayMs = Math.max(5, Math.min(250, bufferedSec * 500));
    schedule(() => void pumpLoop(), delayMs);
  };

  async function pumpLoop(): Promise<void> {
    if (stopped || running) return;
    running = true;
    const myGeneration = generation;

    try {
      while (!stopped && generation === myGeneration) {
        if (!drainPending()) {
          waitAndResume();
          return;
        }
        if (atEnd || cursorSec >= durationSec) {
          engine.markEnded();
          return;
        }
        // Only read when there is somewhere to put the result; otherwise a
        // full window would sit in `pending` holding memory for nothing.
        if (engine.availableWrite() < sampleRate * windowSeconds * 0.25) {
          waitAndResume();
          return;
        }

        const startSec = cursorSec;
        const endSec = Math.min(durationSec, startSec + windowSeconds);
        controller = new AbortController();
        const result = await read(startSec, endSec, controller.signal);

        // A seek landed while this read was in flight: its samples are for
        // the position the viewer left.
        if (stopped || generation !== myGeneration) return;

        if (!result || result.samples.length === 0) {
          atEnd = true;
          engine.markEnded();
          return;
        }

        pending = result.samples;
        pendingOffsetFrames = 0;
        cursorSec = endSec;
        if (endSec >= durationSec) atEnd = true;
      }
    } catch (error) {
      if (!stopped && generation === myGeneration) {
        atEnd = true;
        onError?.(error);
      }
    } finally {
      running = false;
    }
  }

  return {
    start(fromSec: number) {
      if (stopped) return;
      cursorSec = Math.max(0, fromSec);
      atEnd = false;
      void pumpLoop();
    },
    seek(toSec: number) {
      if (stopped) return;
      generation += 1;
      controller?.abort();
      controller = null;
      pending = null;
      pendingOffsetFrames = 0;
      atEnd = false;
      cursorSec = Math.max(0, toSec);
      // Order matters: the engine records the flush boundary now, so frames
      // pushed by the restarted loop survive it.
      engine.seek();
      running = false;
      void pumpLoop();
    },
    ended: () => atEnd,
    stop() {
      stopped = true;
      controller?.abort();
      controller = null;
      pending = null;
    },
  };
}
