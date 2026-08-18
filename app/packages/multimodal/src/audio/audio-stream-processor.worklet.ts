// ---------------------------------------------------------------------------
// The consumer half of the streaming audio path: an `AudioWorkletProcessor`
// that pulls interleaved PCM out of the shared ring and writes it to the
// output bus.
//
// This runs on the audio render thread under a hard real-time deadline —
// roughly 2.7ms of wall clock per 128-frame quantum at 48 kHz. Everything
// here is allocation-free and lock-free for that reason: no `await`, no
// `postMessage` on the hot path, no array/object construction inside
// `process()`. Missing the deadline is an audible glitch, not a slow frame.
//
// It shares `ring-buffer.ts` with the producer rather than reimplementing
// the cursor arithmetic, so the two halves cannot drift apart. That module
// touches `globalThis` only inside a function, which matters because
// `AudioWorkletGlobalScope` has no `window` or DOM.
// ---------------------------------------------------------------------------

import { AudioRingBuffer, type AudioRingBufferLayout } from "./ring-buffer";

/** Sent to the main thread when playback state changes materially. */
export type AudioStreamProcessorEvent =
  | { readonly type: "starved" }
  | { readonly type: "recovered" }
  | { readonly type: "ended" };

interface AudioStreamProcessorOptions {
  readonly layout: AudioRingBufferLayout;
}

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  ctor: new (options?: unknown) => AudioWorkletProcessor,
): void;

export const AUDIO_STREAM_PROCESSOR = "fo-audio-stream";

class AudioStreamProcessorImpl extends AudioWorkletProcessor {
  private readonly ring: AudioRingBuffer;
  /**
   * Scratch array of output channel views, allocated once. `process()`
   * receives a fresh `outputs` structure each quantum but the channel
   * `Float32Array`s are reused by the host, so this only ever re-points
   * existing references — no per-quantum allocation.
   */
  private readonly channelScratch: (Float32Array | undefined)[];
  private starved = false;

  constructor(options?: { processorOptions?: AudioStreamProcessorOptions }) {
    super();
    const layout = options?.processorOptions?.layout;
    if (!layout) {
      throw new Error("AudioStreamProcessor requires a ring buffer layout");
    }
    this.ring = new AudioRingBuffer(layout);
    this.channelScratch = new Array<Float32Array | undefined>(
      this.ring.channels,
    );
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const quantum = output[0]?.length ?? 0;
    if (quantum === 0) return true;

    // A seek invalidates everything queued. Doing this before the read means
    // the very next quantum is already the new position, rather than
    // draining audio from where the viewer used to be.
    if (this.ring.applyPendingFlush()) {
      this.starved = false;
    }

    // The ring's channel count is authoritative: the node is constructed
    // with `outputChannelCount` matching it. If the host still hands us a
    // different bus (a channel-count change mid-graph), only fill what both
    // sides have and silence the rest rather than reading out of bounds.
    // Holes are intentional and `read()` skips them: if the bus is narrower
    // than the ring, those channels are dropped but their samples are still
    // consumed, so the remaining channels stay time-aligned.
    for (let channel = 0; channel < this.ring.channels; channel++) {
      this.channelScratch[channel] = output[channel];
    }

    const delivered = this.ring.read(this.channelScratch, quantum);

    if (delivered < quantum) {
      // Zero the tail. `Float32Array#fill` is a single memset, cheap enough
      // for the render thread; leaving stale samples would repeat the last
      // buffer as a buzz.
      for (let channel = 0; channel < output.length; channel++) {
        output[channel]?.fill(0, delivered);
      }
      const missing = quantum - delivered;
      // End of stream is silence too, but it is not a fault — do not count
      // it as an underrun or the diagnostics would climb forever on a
      // finished track.
      if (!this.ring.hasEnded()) {
        this.ring.recordUnderrun(missing);
        if (!this.starved) {
          this.starved = true;
          this.port.postMessage({ type: "starved" });
        }
      }
    } else if (this.starved) {
      this.starved = false;
      this.port.postMessage({ type: "recovered" });
    }

    // Silence does not move the media clock: when data arrives the track
    // resumes from where it stopped, so only real frames count. This is what
    // makes `framesPlayed` a trustworthy position source where
    // `currentTime` is not — that keeps advancing through starvation.
    if (delivered > 0) this.ring.advancePlayed(delivered);

    // Stay alive even at end of stream: a seek can refill this same node,
    // and returning false would tear the processor down permanently. The
    // main thread disconnects the node when the track goes away.
    return true;
  }
}

registerProcessor(AUDIO_STREAM_PROCESSOR, AudioStreamProcessorImpl);
