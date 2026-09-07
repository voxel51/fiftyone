/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Wire protocol shared by every frame-decode worker (the `/frames` image
 * worker and the WebCodecs video worker). Both decode source media off the
 * main thread and transfer `ImageBitmap`s back zero-copy, keyed by 1-indexed
 * presentation-order frame number — so the {@link FrameBitmapStream} base can
 * drive either worker through one contract.
 *
 * The `init` payload is source-specific (the base's `postInit` supplies it),
 * so this file only fixes the *shape* of `init` (a `type` tag) and leaves its
 * fields to the concrete stream. `fetchChunk` carries an opaque `request` that
 * the base builds via `buildChunkRequest`; the worker knows how to read it.
 */

/** main → worker: install fetch/demux context. Extended per source. */
export interface InitMessage {
  type: "init";
}

/** main → worker: decode frames `[startFrame, startFrame+numFrames)`. */
export interface FetchChunkMessage {
  type: "fetchChunk";
  reqId: number;
  /** Source-specific payload built by the stream's `buildChunkRequest`. */
  request: unknown;
}

export type FrameWorkerInbound = InitMessage | FetchChunkMessage;

/**
 * worker → main: one decoded frame. `bitmap` is transferred (zero-copy), so
 * the sender must not touch it afterwards. `meta` is stream-specific opaque
 * payload the base hands to `toMeta` for caching (imavid: `{ src }`; native:
 * `{ timestamp }`).
 */
export interface FrameReadyMessage {
  type: "frameReady";
  reqId: number;
  /** 1-indexed presentation-order frame number. */
  frameNumber: number;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  meta?: unknown;
}

/** worker → main: every frame in a chunk has been processed (or skipped). */
export interface ChunkDoneMessage {
  type: "chunkDone";
  reqId: number;
  /** Inclusive `[startFrame, endFrame]` frame-number range this chunk covered. */
  range: [number, number];
}

/** worker → main: a chunk failed at the top level (fetch / demux / decode). */
export interface ChunkFailedMessage {
  type: "chunkFailed";
  reqId: number;
  error: string;
}

/**
 * worker → main: the verdict of a `probeOnly` init — whether the source video
 * is decodable via WebCodecs. Emitted only by the WebCodecs worker's probe
 * branch (the decode-strategy resolver awaits it); the full-decode init and the
 * `/frames` worker never send it.
 */
export interface CapabilityMessage {
  type: "capability";
  decodable: boolean;
  /** Demuxed codec string when known (absent on fetch/demux failure). */
  codec?: string;
  /** Human-readable reason when not decodable (diagnostics). */
  reason?: string;
  /** Audio track present in the container; absent when unknown. */
  hasAudio?: boolean;
}

/**
 * worker → main: the verdict of a `tableOnly` init — the source's
 * presentation-order frame table (sorted start timestamps, µs; index i is
 * frame i+1), or `null` when the header couldn't be demuxed. Emitted only by
 * the WebCodecs worker's table branch (the frame-table fetcher awaits it and
 * then terminates the worker).
 */
export interface FrameTableMessage {
  type: "frameTable";
  /** Sorted presentation start times in µs; index i ↔ frame i+1. */
  timesMicros: number[] | null;
  /** Why the table is unavailable, when `timesMicros` is null (diagnostics). */
  reason?: string;
}

export type FrameWorkerOutbound =
  | FrameReadyMessage
  | ChunkDoneMessage
  | ChunkFailedMessage
  | CapabilityMessage
  | FrameTableMessage;
