/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Focused ambient shim for mp4box 2.4.1. The package ships real types, but its
 * `main`/`types` fields point at files that only exist under the `exports`
 * map, which classic (`node`) module resolution — what this repo's TS is
 * pinned to — doesn't read. Vite resolves the package fine at runtime via
 * `exports`; this only covers the demux surface {@link ./videoDecodeWorker}
 * uses so type-checking resolves too.
 */
declare module "mp4box" {
  /** A demuxed sample (one frame of encoded video). */
  export interface Sample {
    /** Composition (presentation) timestamp, in track timescale units. */
    cts: number;
    /** Decode timestamp, in track timescale units. */
    dts: number;
    /** Sample duration, in track timescale units. */
    duration: number;
    /** True for sync (keyframe) samples. */
    is_sync: boolean;
    /** Encoded bytes. Present once extraction is enabled. */
    data?: Uint8Array;
    /** Sample number (decode order, 1-indexed). */
    number: number;
    /** Absolute byte offset of the sample in the file (from `stbl`, moov-only). */
    offset: number;
    size: number;
    timescale: number;
    track_id: number;
  }

  export interface Track {
    id: number;
    /** RFC 6381 codec string, e.g. `"avc1.640028"`. */
    codec: string;
    nb_samples: number;
    timescale: number;
    track_width: number;
    track_height: number;
    type?: "audio" | "video" | "subtitles" | "metadata";
  }

  export interface Movie {
    videoTracks: Track[];
    audioTracks: Track[];
    tracks: Track[];
    duration: number;
    timescale: number;
  }

  export interface ISOFile {
    onReady?: (info: Movie) => void;
    onError?: (error: string) => void;
    onSamples?: (id: number, user: unknown, samples: Sample[]) => void;
    setExtractionOptions(
      id: number,
      user?: unknown,
      options?: { nbSamples?: number },
    ): void;
    start(): void;
    stop(): void;
    flush(): void;
    appendBuffer(data: MP4BoxBuffer, last?: boolean): number;
    getTrackById(id: number): unknown;
    /**
     * The full sample table for a track (offset/size/cts/dts/is_sync per
     * sample), computed from the `moov`'s `stbl` — available after `onReady`
     * without the `mdat` bytes. This is what lets decode range-fetch samples.
     */
    getTrackSamplesInfo(id: number): Sample[];
  }

  export function createFile(keepMdatData?: boolean): ISOFile;

  export class MP4BoxBuffer extends ArrayBuffer {
    fileStart: number;
    static fromArrayBuffer(
      buffer: ArrayBufferLike,
      fileStart: number,
    ): MP4BoxBuffer;
  }

  export class DataStream {
    constructor(
      arrayBuffer?: ArrayBuffer | number,
      byteOffset?: number,
      endianness?: number,
    );
    get buffer(): ArrayBuffer;
    get byteLength(): number;
  }
}
