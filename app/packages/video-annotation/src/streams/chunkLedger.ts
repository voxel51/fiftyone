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

/** A sample's place in presentation order (`0` when not presented). */
export interface OrderedSample {
  frameNumber: number;
}

/** The decode-order samples a chunk needs, as indices into decode order. */
export interface ChunkSpan {
  /** First sample to have been fed for the chunk to decode. */
  dFirst: number;
  /** First and last of the chunk's own samples. */
  dStart: number;
  dEnd: number;
}

/**
 * The decode-order span for presentation frames `[startFrame, endFrame]`, or
 * `null` when none has a sample. `dFirst` reaches back from the chunk's own
 * samples over those just before them that present after the chunk: with
 * B-frames these are the forward references its pictures need (`P13` ahead of
 * `B11 b10 b12`), and no earlier chunk feeds them.
 */
export function chunkSpan(
  decodeOrder: readonly OrderedSample[],
  decodeIndexOf: (frame: number) => number | undefined,
  startFrame: number,
  endFrame: number,
): ChunkSpan | null {
  let dStart = Number.POSITIVE_INFINITY;
  let dEnd = -1;
  for (let frame = startFrame; frame <= endFrame; frame++) {
    const decodeIndex = decodeIndexOf(frame);
    if (decodeIndex === undefined) {
      continue;
    }

    dStart = Math.min(dStart, decodeIndex);
    dEnd = Math.max(dEnd, decodeIndex);
  }

  if (dEnd < 0) {
    return null;
  }

  let dFirst = dStart;
  while (dFirst > 0 && decodeOrder[dFirst - 1].frameNumber > endFrame) {
    dFirst -= 1;
  }

  return { dFirst, dStart, dEnd };
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
 * Which chunk each decoded frame settles. A frame is owed to at most one chunk
 * and settles it once. Frames no chunk owes, such as the lead-in from a
 * keyframe snap, are bonus frames: the stream caches them, so stepping back
 * through them costs no decode.
 *
 * A chunk that continues the open decoder may need samples an earlier chunk
 * already fed (with B-frames, its first picture is often decoded before the
 * B-frames ending the previous chunk). It is owed those frames still in the
 * decoder; ones already out went to the stream as bonus frames.
 */
export class ChunkLedger<C extends OwedChunk> {
  private chunks: C[] = [];
  /** Frame → reqId of the chunk whose samples carried it, until it is out. */
  private readonly inFlight = new Map<number, number>();
  /** Last frame of any chunk opened since the restart; `0` before one. */
  private coveredThrough = 0;
  /**
   * The frame the restart's start point presents. Frames presented before it
   * are an open GOP's leading pictures, decoded without the GOP they
   * reference, so they are dropped rather than posted.
   */
  private floor = 0;

  /** Chunks fed and not yet settled, oldest first. */
  get pending(): readonly C[] {
    return this.chunks;
  }

  /**
   * The decoder restarted at a start point presenting `floor` (`0` for one
   * not presented): nothing fed before is coming out.
   */
  restart(floor: number): void {
    this.inFlight.clear();
    this.coveredThrough = 0;
    this.floor = floor;
  }

  /**
   * Whether a chunk starting at `startFrame` lies past every chunk opened since
   * the restart. Only then were its frames already out of the decoder posted
   * as bonus frames rather than to a chunk the stream may since have evicted,
   * so only then may it continue the decoder.
   */
  follows(startFrame: number): boolean {
    return this.coveredThrough > 0 && startFrame > this.coveredThrough;
  }

  /**
   * Take on `chunk`, owing it the frames in its range that the decoder has yet
   * to output. `decodeIndexOf` places a frame's sample in decode order;
   * `fedThrough` is the last decode index this session fed, or `null` when
   * the chunk starts a fresh one. A chunk left owing nothing is not taken on.
   */
  open(
    chunk: C,
    decodeIndexOf: (frame: number) => number | undefined,
    fedThrough: number | null,
  ): void {
    for (let frame = chunk.startFrame; frame <= chunk.endFrame; frame++) {
      const decodeIndex = decodeIndexOf(frame);
      if (decodeIndex === undefined) {
        continue;
      }

      const out =
        fedThrough !== null &&
        decodeIndex <= fedThrough &&
        !this.inFlight.has(frame);
      if (!out) {
        chunk.expected.add(frame);
      }
    }

    this.coveredThrough = Math.max(this.coveredThrough, chunk.endFrame);
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

    return carrier === undefined || frame < this.floor
      ? null
      : { chunk: null, reqId: carrier };
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
