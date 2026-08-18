import { describe, expect, it } from "vitest";
import {
  AudioRingBuffer,
  allocateAudioRing,
  canUseSharedRingBuffer,
} from "./ring-buffer";

/** Interleaved ramp: frame f, channel c -> f * channels + c. */
function ramp(frames: number, channels: number, from = 0): Float32Array {
  const out = new Float32Array(frames * channels);
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      out[f * channels + c] = (from + f) * channels + c;
    }
  }
  return out;
}

function planar(frames: number, channels: number): Float32Array[] {
  return Array.from({ length: channels }, () => new Float32Array(frames));
}

function ring(capacityFrames: number, channels: number): AudioRingBuffer {
  return new AudioRingBuffer(allocateAudioRing(capacityFrames, channels));
}

describe("allocateAudioRing", () => {
  it("rejects degenerate geometry rather than allocating an unusable ring", () => {
    expect(() => allocateAudioRing(1, 2)).toThrow(RangeError);
    expect(() => allocateAudioRing(8.5, 2)).toThrow(RangeError);
    expect(() => allocateAudioRing(8, 0)).toThrow(RangeError);
  });

  it("sizes the allocation for control block plus interleaved samples", () => {
    const { buffer } = allocateAudioRing(64, 2);
    // 8 control ints + 64 frames * 2 channels * 4 bytes.
    expect(buffer.byteLength).toBe(8 * 4 + 64 * 2 * 4);
  });

  it("uses shared memory only when the page is cross-origin isolated", () => {
    const { buffer } = allocateAudioRing(8, 1);
    expect(buffer instanceof SharedArrayBuffer).toBe(canUseSharedRingBuffer());
  });
});

describe("AudioRingBuffer", () => {
  it("starts empty, with one frame reserved to disambiguate full from empty", () => {
    const rb = ring(16, 2);
    expect(rb.availableRead()).toBe(0);
    expect(rb.availableWrite()).toBe(15);
  });

  it("round-trips interleaved frames as de-interleaved planar output", () => {
    const rb = ring(16, 2);
    expect(rb.write(ramp(4, 2))).toBe(4);
    expect(rb.availableRead()).toBe(4);

    const out = planar(4, 2);
    expect(rb.read(out, 4)).toBe(4);
    // frame f, channel c == f * 2 + c
    expect(Array.from(out[0])).toEqual([0, 2, 4, 6]);
    expect(Array.from(out[1])).toEqual([1, 3, 5, 7]);
    expect(rb.availableRead()).toBe(0);
  });

  it("writes only what fits and reports the short count", () => {
    const rb = ring(8, 1); // 7 usable
    expect(rb.write(ramp(10, 1))).toBe(7);
    expect(rb.availableWrite()).toBe(0);
    expect(rb.write(ramp(1, 1))).toBe(0);
  });

  it("resumes a partial write from offsetFrames without duplicating samples", () => {
    const rb = ring(8, 1); // 7 usable
    const source = ramp(10, 1);
    const first = rb.write(source);
    expect(first).toBe(7);

    const out = planar(7, 1);
    rb.read(out, 7);
    expect(Array.from(out[0])).toEqual([0, 1, 2, 3, 4, 5, 6]);

    // The producer retains the remainder and continues where it stopped.
    expect(rb.write(source, first)).toBe(3);
    const rest = planar(3, 1);
    rb.read(rest, 3);
    expect(Array.from(rest[0])).toEqual([7, 8, 9]);
  });

  it("wraps correctly when a write straddles the physical end of the ring", () => {
    const rb = ring(8, 2); // 7 usable frames
    // Advance the cursors so the next write must wrap.
    rb.write(ramp(5, 2));
    rb.read(planar(5, 2), 5);
    expect(rb.availableRead()).toBe(0);

    // 6 frames from write index 5, capacity 8 -> 3 then wrap 3.
    expect(rb.write(ramp(6, 2, 100))).toBe(6);
    const out = planar(6, 2);
    expect(rb.read(out, 6)).toBe(6);
    expect(Array.from(out[0])).toEqual([200, 202, 204, 206, 208, 210]);
    expect(Array.from(out[1])).toEqual([201, 203, 205, 207, 209, 211]);
  });

  it("survives many wrap cycles without drifting the cursors", () => {
    const rb = ring(8, 1); // 7 usable
    let expected = 0;
    for (let cycle = 0; cycle < 50; cycle++) {
      expect(rb.write(ramp(5, 1, expected))).toBe(5);
      const out = planar(5, 1);
      expect(rb.read(out, 5)).toBe(5);
      expect(Array.from(out[0])).toEqual([
        expected,
        expected + 1,
        expected + 2,
        expected + 3,
        expected + 4,
      ]);
      expected += 5;
    }
    expect(rb.availableRead()).toBe(0);
    expect(rb.availableWrite()).toBe(7);
  });

  it("reads only what is available, leaving the caller to zero-fill", () => {
    const rb = ring(16, 1);
    rb.write(ramp(3, 1));
    const out = planar(8, 1);
    expect(rb.read(out, 8)).toBe(3);
    // Untouched tail stays zero — the consumer treats it as an underrun.
    expect(Array.from(out[0].subarray(3))).toEqual([0, 0, 0, 0, 0]);
  });

  it("reports an empty read rather than throwing when fully drained", () => {
    const rb = ring(16, 2);
    expect(rb.read(planar(4, 2), 4)).toBe(0);
  });
});

describe("seek flush", () => {
  it("discards buffered audio only once the consumer acknowledges", () => {
    const rb = ring(16, 1);
    rb.write(ramp(8, 1));
    expect(rb.availableRead()).toBe(8);

    const generation = rb.requestFlush();
    // The producer must not assume the stale audio is gone yet: the render
    // thread may be mid-callback.
    expect(rb.flushAcknowledged(generation)).toBe(false);
    expect(rb.availableRead()).toBe(8);

    expect(rb.applyPendingFlush()).toBe(true);
    expect(rb.flushAcknowledged(generation)).toBe(true);
    expect(rb.availableRead()).toBe(0);
  });

  it("is a no-op for the consumer when no flush is pending", () => {
    const rb = ring(16, 1);
    rb.write(ramp(4, 1));
    expect(rb.applyPendingFlush()).toBe(false);
    expect(rb.availableRead()).toBe(4);
  });

  it("resets the audio clock and underrun tally, so post-seek timing is not offset", () => {
    const rb = ring(16, 1);
    rb.write(ramp(4, 1));
    rb.read(planar(4, 1), 4);
    rb.advancePlayed(4);
    rb.recordUnderrun(2);
    expect(rb.framesPlayed()).toBe(4);
    expect(rb.underrunFrames()).toBe(2);

    rb.requestFlush();
    rb.applyPendingFlush();
    expect(rb.framesPlayed()).toBe(0);
    expect(rb.underrunFrames()).toBe(0);
  });

  it("frees the whole ring for the new position after a flush", () => {
    const rb = ring(8, 1); // 7 usable
    rb.write(ramp(7, 1));
    expect(rb.availableWrite()).toBe(0);

    rb.requestFlush();
    rb.applyPendingFlush();
    expect(rb.availableWrite()).toBe(7);
    expect(rb.write(ramp(7, 1, 900))).toBe(7);
    const out = planar(7, 1);
    rb.read(out, 7);
    expect(out[0][0]).toBe(900);
  });

  it("keeps audio queued after the flush request, discarding only what preceded it", () => {
    // Regression: an earlier version jumped READ to the live WRITE cursor,
    // which ate the post-seek frames too whenever the producer queued them
    // before the render thread acknowledged. The seek then played silence
    // until the following read landed.
    const rb = ring(64, 1);
    rb.write(ramp(16, 1, 100)); // audio for the position being left

    rb.requestFlush();
    rb.write(ramp(8, 1, 900)); // audio for the position seeked to

    expect(rb.applyPendingFlush()).toBe(true);
    expect(rb.availableRead()).toBe(8);
    const out = planar(8, 1);
    rb.read(out, 8);
    expect(Array.from(out[0])).toEqual([
      900, 901, 902, 903, 904, 905, 906, 907,
    ]);
  });

  it("honors the most recent boundary when seeks arrive faster than the render thread", () => {
    const rb = ring(64, 1);
    rb.write(ramp(8, 1, 100));
    rb.requestFlush();
    rb.write(ramp(8, 1, 200));
    rb.requestFlush();
    rb.write(ramp(4, 1, 300));

    rb.applyPendingFlush();
    expect(rb.availableRead()).toBe(4);
    const out = planar(4, 1);
    rb.read(out, 4);
    expect(Array.from(out[0])).toEqual([300, 301, 302, 303]);
  });

  it("clears the ended flag so a seek out of end-of-stream resumes", () => {
    const rb = ring(16, 1);
    rb.markEnded();
    expect(rb.hasEnded()).toBe(true);
    rb.requestFlush();
    expect(rb.hasEnded()).toBe(false);
  });

  it("acknowledges the latest generation when seeks arrive back to back", () => {
    const rb = ring(16, 1);
    rb.write(ramp(4, 1));
    rb.requestFlush();
    const second = rb.requestFlush();
    // One consumer pass collapses both: it jumps to the current write cursor.
    expect(rb.applyPendingFlush()).toBe(true);
    expect(rb.flushAcknowledged(second)).toBe(true);
    expect(rb.availableRead()).toBe(0);
  });
});

describe("clock and diagnostics", () => {
  it("counts frames played, not context time, so starvation is visible", () => {
    const rb = ring(16, 1);
    rb.advancePlayed(128);
    rb.advancePlayed(128);
    expect(rb.framesPlayed()).toBe(256);
  });

  it("tracks end-of-stream separately from starvation", () => {
    const rb = ring(16, 1);
    expect(rb.hasEnded()).toBe(false);
    rb.markEnded();
    expect(rb.hasEnded()).toBe(true);
  });
});

describe("producer/consumer interleaving", () => {
  it("preserves sample order under randomized partial writes and reads", () => {
    const rb = ring(32, 2);
    const total = 500;
    const source = ramp(total, 2);

    let written = 0;
    let readBack = 0;
    const seen: number[] = [];
    // Deterministic pseudo-random sizes: a fixed LCG keeps the failure
    // reproducible, which `Math.random()` would not.
    let seed = 12345;
    const nextSize = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return 1 + (seed % max);
    };

    let guard = 0;
    while (readBack < total && guard++ < 100000) {
      if (written < total) {
        written += rb.write(source.subarray(written * 2), 0);
      }
      const want = Math.min(nextSize(9), total - readBack);
      const out = planar(want, 2);
      const got = rb.read(out, want);
      for (let f = 0; f < got; f++) {
        seen.push(out[0][f], out[1][f]);
      }
      readBack += got;
    }

    expect(readBack).toBe(total);
    expect(seen).toEqual(Array.from(source));
  });
});

describe("shared memory topology", () => {
  // The allocator gates on `crossOriginIsolated`, which is undefined under
  // the test runner, so these build the layout by hand. Production runs
  // exactly this shape: two `AudioRingBuffer` views — the producer on the
  // main thread, the consumer on the audio render thread — over one
  // `SharedArrayBuffer`. Every test above shares a single instance between
  // both roles and so cannot catch a field accidentally held in JS state
  // instead of the shared control block.
  const sharedLayout = (capacityFrames: number, channels: number) => ({
    buffer: new SharedArrayBuffer(
      8 * 4 + capacityFrames * channels * Float32Array.BYTES_PER_ELEMENT,
    ),
    capacityFrames,
    channels,
  });

  it("carries samples between two independent views of one buffer", () => {
    const layout = sharedLayout(16, 2);
    const producer = new AudioRingBuffer(layout);
    const consumer = new AudioRingBuffer(layout);

    expect(producer.write(ramp(5, 2))).toBe(5);
    // The consumer was never told; it reads the shared cursor.
    expect(consumer.availableRead()).toBe(5);

    const out = planar(5, 2);
    expect(consumer.read(out, 5)).toBe(5);
    expect(Array.from(out[0])).toEqual([0, 2, 4, 6, 8]);

    // ...and the producer sees the space the consumer freed.
    expect(producer.availableWrite()).toBe(15);
  });

  it("propagates a seek flush from producer to consumer and back", () => {
    const layout = sharedLayout(16, 1);
    const producer = new AudioRingBuffer(layout);
    const consumer = new AudioRingBuffer(layout);

    producer.write(ramp(8, 1));
    const generation = producer.requestFlush();
    expect(producer.flushAcknowledged(generation)).toBe(false);

    expect(consumer.applyPendingFlush()).toBe(true);
    expect(producer.flushAcknowledged(generation)).toBe(true);
    expect(producer.availableWrite()).toBe(15);
  });

  it("publishes the audio clock and end-of-stream across views", () => {
    const layout = sharedLayout(16, 1);
    const producer = new AudioRingBuffer(layout);
    const consumer = new AudioRingBuffer(layout);

    consumer.advancePlayed(480);
    consumer.recordUnderrun(128);
    expect(producer.framesPlayed()).toBe(480);
    expect(producer.underrunFrames()).toBe(128);

    producer.markEnded();
    expect(consumer.hasEnded()).toBe(true);
  });
});
