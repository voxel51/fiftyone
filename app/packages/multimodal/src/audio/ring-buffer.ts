// ---------------------------------------------------------------------------
// Lock-free SPSC ring buffer for streaming PCM into an AudioWorklet.
//
// One producer (the main thread, filling from paged MCAP reads) and one
// consumer (the audio render thread) share one `SharedArrayBuffer`. No
// locks: the render thread runs under a hard real-time deadline and must
// never block, so coordination is two atomic cursors that only ever move
// forward, each written by exactly one side.
//
// Layout, one allocation:
//
//   [ control: Int32Array(CONTROL_SLOTS) ][ data: Float32Array(capacity * ch) ]
//
// `write` is only ever stored by the producer and `read` only by the
// consumer, so neither needs a compare-and-swap — an `Atomics.store` with
// the matching `Atomics.load` on the other side is enough to publish the
// samples that precede it.
//
// Capacity is one frame short of usable: `write === read` has to mean empty,
// so a full buffer is `write + 1 === read` (mod capacity). Sizing accounts
// for this.
// ---------------------------------------------------------------------------

/** Cursor and telemetry slots, in `Int32Array` units. */
const CONTROL = Object.freeze({
  /** Next frame index the producer will write. Producer-owned. */
  WRITE: 0,
  /** Next frame index the consumer will read. Consumer-owned. */
  READ: 1,
  /**
   * Bumped by the producer to discard everything currently buffered (seek).
   * The consumer observes the change, jumps `READ` to `WRITE`, and echoes
   * the value into `GENERATION_ACK` so the producer knows the stale audio
   * is gone rather than merely requested gone.
   */
  GENERATION: 2,
  /** Last generation the consumer has acted on. Consumer-owned. */
  GENERATION_ACK: 3,
  /**
   * Frames the consumer has emitted since the last flush. Drives the audio
   * clock: this is the only honest answer to "what is the DAC playing",
   * because `AudioContext.currentTime` advances even while the worklet is
   * starved and emitting silence.
   */
  FRAMES_PLAYED: 4,
  /** Frames of silence emitted because the buffer ran dry. Diagnostics. */
  UNDERRUN_FRAMES: 5,
  /**
   * Set by the producer once no more data is coming for this generation, so
   * the consumer can distinguish "end of stream" from "starved".
   */
  ENDED: 6,
  /**
   * Write cursor at the instant of the last flush request — the boundary
   * between audio for the position the viewer left and audio for the one
   * they seeked to. The consumer jumps `READ` here rather than to the live
   * `WRITE`, so post-seek frames the producer has already queued survive.
   */
  FLUSH_TO: 7,
});

const CONTROL_SLOTS = 8;
const CONTROL_BYTES = CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT;

/** True when this context can back a ring with shared memory. */
export function canUseSharedRingBuffer(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof Atomics !== "undefined" &&
    typeof globalThis.crossOriginIsolated !== "undefined" &&
    globalThis.crossOriginIsolated === true
  );
}

export interface AudioRingBufferLayout {
  readonly buffer: SharedArrayBuffer | ArrayBuffer;
  readonly capacityFrames: number;
  readonly channels: number;
}

/**
 * Allocates the backing store for a ring holding `capacityFrames` frames of
 * `channels`-channel interleaved float samples.
 *
 * Falls back to a plain `ArrayBuffer` when the page is not cross-origin
 * isolated (notebook/Colab embeds skip COOP/COEP, and Safari does not
 * implement `COEP: credentialless`). That buffer cannot be shared with the
 * render thread, so the caller must use the port-transfer transport
 * instead — `canUseSharedRingBuffer()` is the check that decides.
 */
export function allocateAudioRing(
  capacityFrames: number,
  channels: number,
): AudioRingBufferLayout {
  if (!Number.isInteger(capacityFrames) || capacityFrames < 2) {
    throw new RangeError(`capacityFrames must be an integer >= 2`);
  }
  if (!Number.isInteger(channels) || channels < 1) {
    throw new RangeError(`channels must be a positive integer`);
  }
  const bytes =
    CONTROL_BYTES + capacityFrames * channels * Float32Array.BYTES_PER_ELEMENT;
  const buffer = canUseSharedRingBuffer()
    ? new SharedArrayBuffer(bytes)
    : new ArrayBuffer(bytes);
  return { buffer, capacityFrames, channels };
}

/**
 * Typed views over a ring allocation. Both threads construct one of these
 * over the same buffer; it holds no state of its own.
 */
export class AudioRingBuffer {
  private readonly control: Int32Array;
  private readonly data: Float32Array;
  readonly capacityFrames: number;
  readonly channels: number;

  constructor({ buffer, capacityFrames, channels }: AudioRingBufferLayout) {
    this.control = new Int32Array(buffer, 0, CONTROL_SLOTS);
    this.data = new Float32Array(
      buffer,
      CONTROL_BYTES,
      capacityFrames * channels,
    );
    this.capacityFrames = capacityFrames;
    this.channels = channels;
  }

  /** Frames available to read. */
  availableRead(): number {
    const write = Atomics.load(this.control, CONTROL.WRITE);
    const read = Atomics.load(this.control, CONTROL.READ);
    return write >= read ? write - read : write + this.capacityFrames - read;
  }

  /** Frames the producer may write before the ring is full. */
  availableWrite(): number {
    // One frame is reserved so a full ring is distinguishable from an empty
    // one; see the header.
    return this.capacityFrames - 1 - this.availableRead();
  }

  /**
   * Producer: copies as many frames of `interleaved` as fit, starting at
   * `offsetFrames`. Returns the number of frames actually written, which is
   * short of the request whenever the ring is nearly full — the caller
   * retains the remainder and retries after the consumer drains.
   */
  write(interleaved: Float32Array, offsetFrames = 0): number {
    const { channels, capacityFrames } = this;
    const requested = Math.max(
      0,
      Math.floor(interleaved.length / channels) - offsetFrames,
    );
    const writable = Math.min(requested, this.availableWrite());
    if (writable === 0) return 0;

    const write = Atomics.load(this.control, CONTROL.WRITE);
    // At most two copies: up to the physical end of the ring, then the
    // wrapped remainder.
    const firstFrames = Math.min(writable, capacityFrames - write);
    this.data.set(
      interleaved.subarray(
        offsetFrames * channels,
        (offsetFrames + firstFrames) * channels,
      ),
      write * channels,
    );
    const remaining = writable - firstFrames;
    if (remaining > 0) {
      this.data.set(
        interleaved.subarray(
          (offsetFrames + firstFrames) * channels,
          (offsetFrames + writable) * channels,
        ),
        0,
      );
    }
    // Publishes the sample copies above: the consumer's `Atomics.load` of
    // WRITE synchronizes-with this store, so it cannot observe the new
    // cursor without also observing the data.
    Atomics.store(
      this.control,
      CONTROL.WRITE,
      (write + writable) % capacityFrames,
    );
    return writable;
  }

  /**
   * Consumer: fills `planar` (one `Float32Array` per channel) with up to
   * `frames` frames, de-interleaving as it goes. Returns frames delivered;
   * the caller zero-fills the rest and counts it as an underrun.
   */
  read(planar: readonly (Float32Array | undefined)[], frames: number): number {
    const { channels, capacityFrames } = this;
    const readable = Math.min(frames, this.availableRead());
    if (readable === 0) return 0;

    const read = Atomics.load(this.control, CONTROL.READ);
    for (let frame = 0; frame < readable; frame++) {
      const src = ((read + frame) % capacityFrames) * channels;
      for (let channel = 0; channel < channels; channel++) {
        const out = planar[channel];
        if (out) out[frame] = this.data[src + channel] ?? 0;
      }
    }
    Atomics.store(
      this.control,
      CONTROL.READ,
      (read + readable) % capacityFrames,
    );
    return readable;
  }

  /**
   * Producer: discards audio queued before this call. Used on seek, where
   * every sample already buffered belongs to the position the viewer just
   * left. Frames written *after* this call are for the new position and are
   * preserved, so the producer does not have to wait for the acknowledgement
   * before queueing them.
   *
   * The consumer performs the actual cursor move, because moving READ from
   * this side would race a read already in flight on the render thread.
   */
  requestFlush(): number {
    Atomics.store(this.control, CONTROL.ENDED, 0);
    // Order matters: the boundary must be visible before the generation that
    // advertises it, or the consumer could act on a stale `FLUSH_TO`.
    Atomics.store(
      this.control,
      CONTROL.FLUSH_TO,
      Atomics.load(this.control, CONTROL.WRITE),
    );
    return Atomics.add(this.control, CONTROL.GENERATION, 1) + 1;
  }

  /** Producer: true once the consumer has dropped the flushed audio. */
  flushAcknowledged(generation: number): boolean {
    return Atomics.load(this.control, CONTROL.GENERATION_ACK) >= generation;
  }

  /**
   * Consumer: drops buffered audio if the producer asked for a flush.
   * Returns true when a flush happened, so the caller can reset its own
   * position bookkeeping.
   */
  applyPendingFlush(): boolean {
    const generation = Atomics.load(this.control, CONTROL.GENERATION);
    if (generation === Atomics.load(this.control, CONTROL.GENERATION_ACK)) {
      return false;
    }
    // Not `WRITE`: the producer may already have queued audio for the new
    // position, and jumping to the live write cursor would throw that away
    // too, leaving the seek silent until the next read landed.
    Atomics.store(
      this.control,
      CONTROL.READ,
      Atomics.load(this.control, CONTROL.FLUSH_TO),
    );
    Atomics.store(this.control, CONTROL.FRAMES_PLAYED, 0);
    Atomics.store(this.control, CONTROL.UNDERRUN_FRAMES, 0);
    Atomics.store(this.control, CONTROL.GENERATION_ACK, generation);
    return true;
  }

  /** Consumer: records frames emitted to the output. */
  advancePlayed(frames: number): void {
    Atomics.add(this.control, CONTROL.FRAMES_PLAYED, frames);
  }

  /** Consumer: records frames of silence emitted because the ring was dry. */
  recordUnderrun(frames: number): void {
    Atomics.add(this.control, CONTROL.UNDERRUN_FRAMES, frames);
  }

  /** Frames emitted since the last flush. The audio clock. */
  framesPlayed(): number {
    return Atomics.load(this.control, CONTROL.FRAMES_PLAYED);
  }

  underrunFrames(): number {
    return Atomics.load(this.control, CONTROL.UNDERRUN_FRAMES);
  }

  /** Producer: marks the current generation complete. */
  markEnded(): void {
    Atomics.store(this.control, CONTROL.ENDED, 1);
  }

  /** Consumer: true when the producer will send nothing further. */
  hasEnded(): boolean {
    return Atomics.load(this.control, CONTROL.ENDED) === 1;
  }
}
