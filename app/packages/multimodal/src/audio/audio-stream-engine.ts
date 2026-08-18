// ---------------------------------------------------------------------------
// Main-thread half of streaming audio playback.
//
// Owns the transport only: the `AudioContext`, the worklet node, and the
// ring the render thread drains. It knows nothing about MCAP, Foxglove, or
// where samples come from — a caller pushes interleaved PCM and this makes
// it audible. That keeps `src/audio/` container-neutral, the same property
// `use-audio-playback.ts` documents.
//
// Backpressure is the caller's job, and deliberately so: `push()` reports
// how many frames it accepted, and the producer retains the rest. A ring
// that silently dropped the overflow would desynchronize audio from the
// timeline with no way to notice.
// ---------------------------------------------------------------------------

import workletUrl from "./audio-stream-processor.worklet?worker&url";
import {
  AudioRingBuffer,
  allocateAudioRing,
  canUseSharedRingBuffer,
} from "./ring-buffer";

/**
 * How much audio the ring holds. Large enough that a slow windowed read
 * cannot starve the render thread, small enough that a seek discards little
 * work: at 48 kHz stereo this is ~1.5MB.
 */
const DEFAULT_BUFFER_SECONDS = 4;

/** Thrown when the page cannot back a ring with shared memory. */
export class SharedAudioUnavailableError extends Error {
  constructor() {
    super(
      "Streaming audio requires a cross-origin-isolated page (SharedArrayBuffer)",
    );
    this.name = "SharedAudioUnavailableError";
  }
}

export interface AudioStreamEngineOptions {
  readonly channels: number;
  /**
   * The source's sample rate. The `AudioContext` is created at exactly this
   * rate so the worklet can pass samples through untouched — a context at a
   * different rate would need resampling on the render thread, and playing
   * 44.1kHz material through a 48kHz graph without it shifts pitch.
   */
  readonly sampleRate: number;
  readonly bufferSeconds?: number;
  /** Notified when the ring runs dry and when it refills. */
  readonly onStarvationChange?: (starved: boolean) => void;
}

export interface AudioStreamEngine {
  readonly node: AudioWorkletNode;
  readonly audioContext: AudioContext;
  readonly channels: number;
  readonly sampleRate: number;
  /** Frames the ring can accept right now. */
  availableWrite(): number;
  /**
   * Queues interleaved PCM starting at `offsetFrames`. Returns frames
   * accepted, which is short whenever the ring is nearly full — the caller
   * keeps the remainder and pushes again once the render thread drains.
   */
  push(interleaved: Float32Array, offsetFrames?: number): number;
  /**
   * Discards audio queued before this call. Frames pushed afterwards are
   * treated as the new position, so the caller need not wait for the render
   * thread to acknowledge before queueing them.
   */
  seek(): void;
  /** Marks the current position's audio complete, so silence is not a fault. */
  markEnded(): void;
  /** Seconds of real audio emitted since the last `seek()`. The audio clock. */
  playedSeconds(): number;
  /** Frames of silence emitted because the ring ran dry. Diagnostics. */
  underrunFrames(): number;
  dispose(): Promise<void>;
}

/**
 * Test seam mirroring `__FO_TEST_SAM2_WORKER_FACTORY`: jsdom has no
 * `AudioWorklet`, so tests substitute the whole transport rather than
 * leaving this path uncovered.
 */
declare global {
  // eslint-disable-next-line no-var
  var __FO_TEST_AUDIO_ENGINE_FACTORY:
    | ((options: AudioStreamEngineOptions) => Promise<AudioStreamEngine>)
    | undefined;
}

export async function createAudioStreamEngine(
  options: AudioStreamEngineOptions,
): Promise<AudioStreamEngine> {
  const testFactory = globalThis.__FO_TEST_AUDIO_ENGINE_FACTORY;
  if (testFactory) return testFactory(options);

  const {
    channels,
    sampleRate,
    bufferSeconds = DEFAULT_BUFFER_SECONDS,
    onStarvationChange,
  } = options;

  if (!canUseSharedRingBuffer()) {
    // Callers fall back to the buffered `AudioBuffer` path. Failing loudly
    // here beats constructing a ring the render thread cannot see, which
    // would present as unexplained silence.
    throw new SharedAudioUnavailableError();
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`Invalid audio sample rate: ${sampleRate}`);
  }

  const audioContext = new AudioContext({ sampleRate });
  let disposed = false;

  try {
    await audioContext.audioWorklet.addModule(workletUrl);
  } catch (error) {
    void audioContext.close().catch(() => undefined);
    throw error;
  }

  const layout = allocateAudioRing(
    Math.max(2, Math.ceil(bufferSeconds * sampleRate)),
    channels,
  );
  const ring = new AudioRingBuffer(layout);

  const node = new AudioWorkletNode(audioContext, "fo-audio-stream", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    // Must match the ring: the processor silences any output channel the
    // ring does not cover.
    outputChannelCount: [channels],
    processorOptions: { layout },
  });

  if (onStarvationChange) {
    node.port.onmessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | null)?.type;
      if (type === "starved") onStarvationChange(true);
      else if (type === "recovered") onStarvationChange(false);
    };
  }

  return {
    node,
    audioContext,
    channels,
    sampleRate,
    availableWrite: () => ring.availableWrite(),
    push: (interleaved, offsetFrames = 0) =>
      ring.write(interleaved, offsetFrames),
    seek: () => {
      ring.requestFlush();
    },
    markEnded: () => ring.markEnded(),
    playedSeconds: () => ring.framesPlayed() / sampleRate,
    underrunFrames: () => ring.underrunFrames(),
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      node.port.onmessage = null;
      node.disconnect();
      // Browsers cap concurrent AudioContexts per page; leaking them
      // eventually makes construction fail, presenting as silence.
      await audioContext.close().catch(() => undefined);
    },
  };
}
