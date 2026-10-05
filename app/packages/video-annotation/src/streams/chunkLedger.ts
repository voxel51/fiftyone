/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/** A chunk fed to the decoder. */
export interface OwedChunk {
  reqId: number;
  startFrame: number;
  endFrame: number;
  /** Frame numbers this chunk has yet to see out of the decoder. */
  expected: Set<number>;
}

/**
 * Where a decoded frame goes: to the chunk that owes it, or with `chunk: null`
 * to the stream's cache as a bonus frame, posted under the `reqId` of the
 * chunk whose samples carried it.
 */
export interface FrameDestination<C> {
  chunk: C | null;
  reqId: number;
}

/**
 * Which chunk each decoded frame settles. Every frame in a chunk's range is
 * owed to that chunk alone and settles it once. Frames no chunk owes, such as
 * the lead-in from a keyframe snap, are bonus frames: the stream caches them,
 * so stepping back through them costs no decode.
 */
export class ChunkLedger<C extends OwedChunk> {
  private chunks: C[] = [];
  /** Frame → reqId of the chunk whose samples carried it, until it is out. */
  private readonly inFlight = new Map<number, number>();

  /** Chunks fed and not yet settled, oldest first. */
  get pending(): readonly C[] {
    return this.chunks;
  }

  /** The decoder restarted: nothing fed before is coming out. */
  restart(): void {
    this.inFlight.clear();
  }

  /**
   * Take on `chunk`, owing it every frame in its range that has a sample. A
   * chunk left owing nothing is not taken on.
   */
  open(chunk: C, hasSample: (frame: number) => boolean): void {
    for (let frame = chunk.startFrame; frame <= chunk.endFrame; frame++) {
      if (hasSample(frame)) {
        chunk.expected.add(frame);
      }
    }

    if (chunk.expected.size > 0) {
      this.chunks.push(chunk);
    }
  }

  /** The sample presenting `frame` was fed for the chunk `reqId`. */
  fed(frame: number, reqId: number): void {
    if (frame > 0) {
      this.inFlight.set(frame, reqId);
    }
  }

  /** Where the decoded `frame` goes, or `null` to drop it. */
  output(frame: number | undefined): FrameDestination<C> | null {
    if (frame === undefined) {
      return null;
    }

    const carrier = this.inFlight.get(frame);
    this.inFlight.delete(frame);

    const chunk = this.chunks.find((c) => c.expected.has(frame));
    if (chunk) {
      chunk.expected.delete(frame);
      return { chunk, reqId: chunk.reqId };
    }

    return carrier === undefined ? null : { chunk: null, reqId: carrier };
  }

  /** Stop tracking `chunk`; `false` when it was already settled. */
  settle(chunk: C): boolean {
    if (!this.chunks.includes(chunk)) {
      return false;
    }

    this.chunks = this.chunks.filter((c) => c !== chunk);
    return true;
  }
}
