/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { ChunkLedger, type OwedChunk } from "./chunkLedger";

const chunk = (reqId: number, startFrame: number, endFrame: number) => ({
  reqId,
  startFrame,
  endFrame,
  expected: new Set<number>(),
});

const everyFrame = () => true;

describe("ChunkLedger", () => {
  it("posts the lead-in of a keyframe snap as bonus frames", () => {
    const ledger = new ChunkLedger<OwedChunk>();
    const request = chunk(7, 10, 12);
    ledger.restart();
    ledger.open(request, everyFrame);

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
    ledger.open(request, (frame) => frame <= 2);

    expect([...request.expected]).toEqual([1, 2]);
    expect(ledger.pending).toEqual([request]);

    const empty = chunk(2, 5, 6);
    ledger.open(empty, () => false);
    expect(ledger.pending).toEqual([request]);
  });

  it("drops frames nothing fed, and settles a chunk once", () => {
    const ledger = new ChunkLedger<OwedChunk>();
    const request = chunk(1, 1, 1);
    ledger.open(request, everyFrame);

    expect(ledger.output(undefined)).toBeNull();
    expect(ledger.output(5)).toBeNull();

    expect(ledger.settle(request)).toBe(true);
    expect(ledger.settle(request)).toBe(false);
  });

  it("forgets frames in flight across a restart", () => {
    const ledger = new ChunkLedger<OwedChunk>();
    ledger.fed(3, 1);
    ledger.restart();

    expect(ledger.output(3)).toBeNull();
  });
});
