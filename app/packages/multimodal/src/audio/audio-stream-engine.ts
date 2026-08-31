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
  /** Frames queued and not yet emitted — how much runway the render thread has. */
  bufferedFrames(): number;
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
  /**
   * Drops queued audio and restarts the clock. Returns a ticket for
   * {@link clockSettled}: the audio thread does the actual reset on its next
   * turn, so the clock is meaningless until then.
   */
  seek(): number;
  /**
   * Whether the audio thread has acted on the `seek()` that returned
   * `ticket`. Until it has, `playedSeconds()` still counts audio from before
   * the seek and must not be used to judge position.
   */
  clockSettled(ticket: number): boolean;
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

// ---------------------------------------------------------------------------
// Shared AudioContexts, keyed by sample rate.
//
// One context per engine meant one per audio source: four audio topics in a
// recording produced four contexts, four worklets and four pumps, whether or
// not any of them was audible. Browsers cap concurrent contexts per page, so
// that scales into silence rather than into slowness.
//
// Keyed by rate rather than shared outright because an `AudioContext` has a
// single `sampleRate` and a worklet renders at it. Sources that agree on a
// rate — in practice all of them — share one context; a source at a
// different rate gets its own, which is still correct and avoids resampling
// in the render thread.
// ---------------------------------------------------------------------------

/**
 * Resolved on first use rather than imported at module scope.
 *
 * `?worker&url` is a bundler contract, not a language feature. A bundler
 * that does not implement it evaluates the worklet inside the app bundle
 * instead of emitting a separate module asset, and the worklet then throws
 * `AudioWorkletProcessor is not defined` — a global that only exists on the
 * render thread. As a static import that happened during module evaluation,
 * before any caller existed to catch it, so a shell that mis-bundles the
 * worklet lost the whole episode modal rather than just its audio.
 *
 * Deferring it moves that failure inside `acquireAudioContext`, where it
 * surfaces as a rejected `ready` and the existing handler in
 * `use-audio-stream-playback.ts` degrades it to an audio-only error.
 *
 * The promise is memoized so concurrent sources share one fetch, but cleared
 * on rejection: this is a chunk load, so a transient network failure must not
 * poison every later attempt.
 */
let workletUrlPromise: Promise<string> | undefined;

function resolveWorkletUrl(): Promise<string> {
  workletUrlPromise ??= import("./audio-stream-processor.worklet?worker&url")
    .then((module) => module.default)
    .catch((error: unknown) => {
      workletUrlPromise = undefined;
      throw error;
    });
  return workletUrlPromise;
}

interface ContextLease {
  readonly audioContext: AudioContext;
  release(): Promise<void>;
}

interface SharedContext {
  readonly audioContext: AudioContext;
  /** Resolves once the worklet module is registered on this context. */
  readonly ready: Promise<void>;
  leases: number;
}

const SHARED_CONTEXTS = new Map<number, SharedContext>();

async function acquireAudioContext(sampleRate: number): Promise<ContextLease> {
  let shared = SHARED_CONTEXTS.get(sampleRate);
  if (!shared) {
    const audioContext = new AudioContext({ sampleRate });
    shared = {
      audioContext,
      // Registered once per context, not once per engine: `addModule` is
      // idempotent but re-awaiting it per source serialises engine startup
      // behind a fetch that has already happened.
      ready: resolveWorkletUrl().then((url) =>
        audioContext.audioWorklet.addModule(url),
      ),
      leases: 0,
    };
    SHARED_CONTEXTS.set(sampleRate, shared);
  }
  shared.leases += 1;

  try {
    await shared.ready;
  } catch (error) {
    // The context is unusable without its worklet — drop it so the next
    // caller retries construction rather than inheriting the failure.
    await releaseAudioContext(sampleRate);
    throw error;
  }

  let released = false;
  return {
    audioContext: shared.audioContext,
    release: async () => {
      if (released) return;
      released = true;
      await releaseAudioContext(sampleRate);
    },
  };
}

async function releaseAudioContext(sampleRate: number): Promise<void> {
  const shared = SHARED_CONTEXTS.get(sampleRate);
  if (!shared) return;
  shared.leases -= 1;
  if (shared.leases > 0) return;
  SHARED_CONTEXTS.delete(sampleRate);
  await shared.audioContext.close().catch(() => undefined);
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

  const lease = await acquireAudioContext(sampleRate);
  const { audioContext } = lease;
  let disposed = false;

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
    bufferedFrames: () => ring.availableRead(),
    push: (interleaved, offsetFrames = 0) =>
      ring.write(interleaved, offsetFrames),
    seek: () => ring.requestFlush(),
    clockSettled: (ticket: number) => ring.flushAcknowledged(ticket),
    markEnded: () => ring.markEnded(),
    playedSeconds: () => ring.framesPlayed() / sampleRate,
    underrunFrames: () => ring.underrunFrames(),
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      node.port.onmessage = null;
      node.disconnect();
      // Browsers cap concurrent AudioContexts per page; leaking them
      // eventually makes construction fail, presenting as silence. The
      // context is shared, so this releases a lease rather than closing
      // outright — it closes once the last engine on that rate is gone.
      await lease.release();
    },
  };
}
