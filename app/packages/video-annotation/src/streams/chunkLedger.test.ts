/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChunkLedger, chunkSpan, type OwedChunk } from "./chunkLedger";
import { DecodeSession } from "./decodeSession";

const chunk = (reqId: number, startFrame: number, endFrame: number) => ({
  reqId,
  startFrame,
  endFrame,
  expected: new Set<number>(),
});

/** Every frame has a sample, at a decode index nothing has fed yet. */
const everyFrame = (frame: number) => frame;

describe("ChunkLedger", () => {
  it("posts the lead-in of a keyframe snap as bonus frames", () => {
    const ledger = new ChunkLedger<OwedChunk>();
    const request = chunk(7, 10, 12);
    ledger.restart(0);
    ledger.open(request, everyFrame, null);

    // the snap decodes from the keyframe at frame 1 through frame 12
    for (let frame = 1; frame <= 12; frame++) {
      ledger.fed(frame, request.reqId);
    }

    for (let frame = 1; frame <= 9; frame++) {
      expect(ledger.output(frame)).toEqual({ chunk: null, reqId: 7 });
    }
    for (let frame = 10; frame <= 12; frame++) {
      expect(ledger.output(frame)).toEqual({ chunk: request, reqId: 7 });
    }

    expect(request.expected.size).toBe(0);
  });

  it("owes a chunk only the frames that have samples", () => {
    const ledger = new ChunkLedger<OwedChunk>();
    const request = chunk(1, 1, 4);
    ledger.open(request, (frame) => (frame <= 2 ? frame : undefined), null);

    expect([...request.expected]).toEqual([1, 2]);
    expect(ledger.pending).toEqual([request]);

    const empty = chunk(2, 5, 6);
    ledger.open(empty, () => undefined, null);
    expect(ledger.pending).toEqual([request]);
  });

  it("drops frames nothing fed, and settles a chunk once", () => {
    const ledger = new ChunkLedger<OwedChunk>();
    const request = chunk(1, 1, 1);
    ledger.open(request, everyFrame, null);

    expect(ledger.output(undefined)).toBeNull();
    expect(ledger.output(5)).toBeNull();

    expect(ledger.settle(request)).toBe(true);
    expect(ledger.settle(request)).toBe(false);
  });

  it("drops leading pictures presented before the start point", () => {
    const ledger = new ChunkLedger<OwedChunk>();
    const request = chunk(1, 13, 13);
    // an open-GOP I-frame presenting frame 13, then its leading B-frames
    ledger.restart(13);
    ledger.open(request, everyFrame, null);
    for (const frame of [13, 11, 12]) {
      ledger.fed(frame, request.reqId);
    }

    expect(ledger.output(11)).toBeNull();
    expect(ledger.output(12)).toBeNull();
    expect(ledger.output(13)).toEqual({ chunk: request, reqId: 1 });
  });

  it("forgets frames in flight across a restart", () => {
    const ledger = new ChunkLedger<OwedChunk>();
    ledger.fed(3, 1);
    ledger.restart(0);

    expect(ledger.output(3)).toBeNull();
  });
});

/**
 * A B-frame stream in decode order (`I1 P5 B3 b2 b4 P9 …`): each chunk's first
 * picture in decode order is a P-frame decoded ahead of the B-frames that end
 * the chunk before it.
 */
const DECODE_ORDER = [
  1, 5, 3, 2, 4, 9, 7, 6, 8, 13, 11, 10, 12, 17, 15, 14, 16, 21, 19, 18, 20,
];
const SAMPLES = DECODE_ORDER.map((frameNumber) => ({ frameNumber }));
const decodeIndexOf = (frame: number) => {
  const index = DECODE_ORDER.indexOf(frame);
  return index < 0 ? undefined : index;
};

/**
 * A `VideoDecoder` stand-in that outputs in presentation order, holding back
 * `depth` finished frames until more input or a flush pushes them out. A
 * chunk's timestamp is its frame number.
 */
class ReorderingDecoder {
  static depth = 0;
  static instances: ReorderingDecoder[] = [];
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  configureCalls = 0;
  private decoded = new Set<number>();
  private next: number | null = null;

  constructor(private readonly init: VideoDecoderInit) {
    ReorderingDecoder.instances.push(this);
  }

  configure() {
    this.configureCalls += 1;
    this.state = "configured";
    this.decoded.clear();
    this.next = null;
  }

  decode(chunk: EncodedVideoChunk) {
    this.next ??= chunk.timestamp;
    this.decoded.add(chunk.timestamp);
    this.drain(ReorderingDecoder.depth);
  }

  async flush() {
    this.drain(0);
  }

  private drain(hold: number) {
    for (;;) {
      let ready = 0;
      while (this.next !== null && this.decoded.has(this.next + ready)) {
        ready += 1;
      }

      if (this.next === null || ready <= hold) {
        return;
      }

      this.decoded.delete(this.next);
      this.init.output({ timestamp: this.next } as VideoFrame);
      this.next += 1;
    }
  }
}

const CONFIG = { codec: "avc1.640028" } as VideoDecoderConfig;

/**
 * Drive chunk requests through a {@link DecodeSession} and a ledger the way
 * the decode worker does, snapping back to the keyframe at decode index 0
 * whenever a chunk cannot continue.
 */
async function play(ranges: Array<[number, number]>) {
  const ledger = new ChunkLedger<OwedChunk>();
  const fed: number[] = [];
  const posted: Array<{ frame: number; reqId: number; owed: boolean }> = [];
  const settled: number[] = [];
  const chunks: OwedChunk[] = [];
  const settle = (c: OwedChunk) => {
    if (ledger.settle(c)) {
      settled.push(c.reqId);
    }
  };

  const session = new DecodeSession(
    (frame) => {
      const destination = ledger.output(frame.timestamp);
      if (!destination) {
        return;
      }

      posted.push({
        frame: frame.timestamp,
        reqId: destination.reqId,
        owed: destination.chunk !== null,
      });
      if (destination.chunk?.expected.size === 0) {
        settle(destination.chunk);
      }
    },
    () => undefined,
  );

  for (const [i, [startFrame, endFrame]] of ranges.entries()) {
    const { dFirst, dEnd } = chunkSpan(
      SAMPLES,
      decodeIndexOf,
      startFrame,
      endFrame,
    )!;

    const fedThrough =
      session.canContinue(dFirst) && ledger.follows(startFrame)
        ? session.fedThrough
        : null;
    if (fedThrough === null) {
      await session.flush();
      [...ledger.pending].forEach(settle);
      session.restart(CONFIG);
      ledger.restart(0);
    }

    const c = chunk(i + 1, startFrame, endFrame);
    chunks.push(c);
    ledger.open(c, decodeIndexOf, fedThrough);
    if (c.expected.size === 0) {
      settled.push(c.reqId);
      continue;
    }

    for (let d = fedThrough === null ? 0 : fedThrough + 1; d <= dEnd; d++) {
      ledger.fed(DECODE_ORDER[d], c.reqId);
      fed.push(d);
      session.decode({ timestamp: DECODE_ORDER[d] } as EncodedVideoChunk, d);
    }
  }

  await session.flush();
  const owedAfterFlush = chunks.reduce((n, c) => n + c.expected.size, 0);
  [...ledger.pending].forEach(settle);

  return { fed, posted, settled, owedAfterFlush };
}

describe("chunkSpan", () => {
  it("reaches back over the forward references a chunk's B-frames need", () => {
    // B11 b10 b12 reference P13, fed just before them
    expect(chunkSpan(SAMPLES, decodeIndexOf, 10, 12)).toEqual({
      dFirst: 9,
      dStart: 10,
      dEnd: 12,
    });
    // P9 opens the chunk in decode order; b4 before it belongs to the last one
    expect(chunkSpan(SAMPLES, decodeIndexOf, 7, 9)).toEqual({
      dFirst: 5,
      dStart: 5,
      dEnd: 8,
    });
  });

  it("is null when no frame has a sample", () => {
    expect(chunkSpan(SAMPLES, decodeIndexOf, 30, 32)).toBeNull();
  });
});

describe("ChunkLedger with a reordering decoder", () => {
  beforeEach(() => {
    ReorderingDecoder.instances = [];
    vi.stubGlobal("VideoDecoder", ReorderingDecoder);
  });

  afterEach(() => {
    ReorderingDecoder.depth = 0;
    vi.unstubAllGlobals();
  });

  const sequential: Array<[number, number]> = [
    [1, 3],
    [4, 6],
    [7, 9],
    [10, 12],
    [13, 15],
    [16, 18],
    [19, 21],
  ];

  it.each([0, 2])(
    "plays chunk after chunk decoding each sample once (decoder holds %i)",
    async (depth) => {
      ReorderingDecoder.depth = depth;
      const { fed, posted, settled, owedAfterFlush } = await play(sequential);

      expect(fed).toEqual(DECODE_ORDER.map((_, i) => i));
      expect(ReorderingDecoder.instances[0].configureCalls).toBe(1);

      // every frame comes out once, to the chunk asking for it or as a bonus
      expect(posted.map((p) => p.frame).sort((a, b) => a - b)).toEqual(
        DECODE_ORDER.slice().sort((a, b) => a - b),
      );
      for (const p of posted.filter((p) => p.owed)) {
        const [start, end] = sequential[p.reqId - 1];
        expect(p.frame).toBeGreaterThanOrEqual(start);
        expect(p.frame).toBeLessThanOrEqual(end);
      }

      expect(owedAfterFlush).toBe(0);
      expect(settled.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    },
  );

  it("owes a chunk the frames still in the decoder without feeding again", async () => {
    ReorderingDecoder.depth = 2;
    // frame 5 is fed with the first chunk, ahead of the B-frames 2-4
    const { fed, posted, owedAfterFlush } = await play([
      [1, 4],
      [5, 5],
    ]);

    expect(fed).toEqual([0, 1, 2, 3, 4]);
    expect(posted).toContainEqual({ frame: 5, reqId: 2, owed: true });
    expect(owedAfterFlush).toBe(0);
  });

  it("restarts for a chunk behind the ones already played", async () => {
    const { fed, posted } = await play([
      [7, 9],
      [1, 3],
    ]);

    expect(ReorderingDecoder.instances[0].configureCalls).toBe(2);
    expect(fed.filter((d) => d === 0)).toHaveLength(2);
    for (const frame of [1, 2, 3]) {
      expect(posted).toContainEqual({ frame, reqId: 2, owed: true });
    }
  });
});
