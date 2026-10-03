/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { isKeyframeSample, type KeyframeProbe } from "./sampleKeyframe";
import { sliceSampleBytes, type SpanBuffer } from "./videoByteRange";

/** What the index needs to know about a demuxed sample. */
export interface SyncSample {
  /** Position in decode order. */
  decodeIndex: number;
  /** The container's sync (keyframe) flag; cleared when the bytes disagree. */
  isSync: boolean;
  offset: number;
  size: number;
}

/**
 * Starting a decode from a sync-flagged sample that is not a keyframe, for
 * encoders that flag all-intra refresh pictures (see {@link ./intraStartProbe}).
 */
export interface IntraStarts {
  /** Whether the sample may serve as a start point, so is not demoted yet. */
  candidate(data: Uint8Array): boolean;
  /** Bytes to decode as the start chunk, or `null` when it cannot be one. */
  chunk(data: Uint8Array): Promise<Uint8Array | null>;
}

/** A decode span from a start point; `start` replaces the first sample's bytes. */
export interface Gop {
  kf: number;
  span: SpanBuffer;
  start?: Uint8Array;
}

/**
 * The keyframes a chunk decode can start from, in decode order, with the
 * container's sync flags verified against sample bytes before they are relied
 * on. A sync table can flag a sample that is not a keyframe (open-GOP encodes
 * and some camera encoders do), and a decoder asked to start there fails the
 * whole chunk. A flag the bytes contradict is dropped here, so the snap moves
 * back to a real keyframe and later snaps skip the sample.
 */
export class KeyframeIndex {
  private indices: number[];

  constructor(
    private readonly samples: readonly SyncSample[],
    private readonly probe: KeyframeProbe,
    private readonly intraStarts?: IntraStarts,
  ) {
    this.indices = samples.filter((s) => s.isSync).map((s) => s.decodeIndex);
  }

  /** Largest keyframe decode index at or before `decodeIndex` (`0` when none). */
  atOrBefore(decodeIndex: number): number {
    let kf = 0;
    for (const k of this.indices) {
      if (k > decodeIndex) {
        break;
      }

      kf = k;
    }

    return kf;
  }

  /**
   * The `EncodedVideoChunk` type for a sample: `key` only when its bytes are a
   * keyframe. The sync flag decides for codecs we do not inspect. A flagged
   * sample the bytes contradict is demoted.
   */
  chunkType(sample: SyncSample, data: Uint8Array): "key" | "delta" {
    const byBytes = isKeyframeSample(data, this.probe);
    if (byBytes === null) {
      return sample.isSync ? "key" : "delta";
    }

    if (sample.isSync && !byBytes && !this.intraStarts?.candidate(data)) {
      this.demote(sample);
    }

    return byBytes ? "key" : "delta";
  }

  /**
   * Snap the decode span starting at `dStart` back to a keyframe whose bytes
   * confirm it. `fetchFrom(kf)` fetches the span's bytes from candidate `kf`;
   * a candidate the bytes contradict is demoted and the previous keyframe
   * tried, unless it can start the decode as an intra picture. Returns `null` when `fetchFrom` has nothing to fetch and throws when
   * no real keyframe precedes the span.
   */
  async resolveGop(
    dStart: number,
    fetchFrom: (kf: number) => Promise<{ kf: number; span: SpanBuffer } | null>,
  ): Promise<Gop | null> {
    let kf = this.atOrBefore(dStart);

    for (;;) {
      const span = (await fetchFrom(kf))?.span;
      if (!span) {
        return null;
      }

      const first = this.samples[kf];
      const data = sliceSampleBytes(span.buffer, span.fileStart, first);
      if (this.chunkType(first, data) === "key") {
        return { kf, span };
      }

      if (first.isSync) {
        const start = await this.intraStarts?.chunk(data);
        if (start) {
          return { kf, span, start };
        }

        this.demote(first);
      }

      if (kf === 0) {
        throw new Error(
          `no keyframe at or before decode index ${dStart}: the first ` +
            "sample is not a keyframe",
        );
      }

      kf = this.atOrBefore(kf - 1);
    }
  }

  private demote(sample: SyncSample): void {
    sample.isSync = false;
    this.indices = this.indices.filter((k) => k !== sample.decodeIndex);
    console.warn(
      `[videoDecodeWorker] sample ${sample.decodeIndex} is flagged sync but ` +
        "is not a keyframe; decoding from the previous keyframe",
    );
  }
}
