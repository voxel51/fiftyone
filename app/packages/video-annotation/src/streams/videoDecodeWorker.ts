/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/// <reference lib="webworker" />
/// <reference types="dom-webcodecs" />

/**
 * WebCodecs video-decode worker. Demuxes the source video with mp4box.js,
 * then decodes frames on demand with a `VideoDecoder`, transferring each
 * decoded frame back as an `ImageBitmap` (zero-copy) keyed by 1-indexed
 * presentation-order frame number. Same wire protocol as the `/frames` image
 * worker (see {@link ./frameWorkerProtocol}) so the {@link FrameBitmapStream}
 * base can drive either.
 *
 * Why a worker: demux + decode + `createImageBitmap` all run off the main
 * thread, and bitmaps transfer without a copy — the tile just `drawImage`s
 * them. This gives ImaVid-style, single-clock lock-step playback WITHOUT the
 * `to_frames` preprocessing/storage cost.
 *
 * Frame-exactness (the load-bearing property): the demuxer's sample table maps
 * each frame's presentation timestamp (`cts`) to a 1-indexed frame number. We
 * stamp every `EncodedVideoChunk` with that timestamp; the decoder echoes it
 * onto the output `VideoFrame`, so we can assign the correct frame number on
 * the way out regardless of decode order (B-frames) or GOP boundaries.
 *
 * GOP handling lives entirely here (the stream base stays source-agnostic): a
 * chunk request for presentation frames `[start, start+n)` is snapped back to
 * the keyframe at/-before the earliest of those frames in DECODE order, and we
 * decode forward through the latest. Lead-in frames are emitted as bonus —
 * they're already decoded and help scrub-back.
 *
 * Scope: MP4 / H.264 first (mp4box + the common `avcC`/`hvcC`/`av1C`/`vpcC`
 * description boxes). Other containers/codecs are follow-ons gated on
 * `VideoDecoder.isConfigSupported`.
 */

import { createFile, DataStream, MP4BoxBuffer } from "mp4box";
import type { ISOFile, Movie, Sample } from "mp4box";
import type {
  CapabilityMessage,
  FetchChunkMessage,
  FrameWorkerInbound,
  FrameWorkerOutbound,
  InitMessage,
} from "./frameWorkerProtocol";
import {
  ByteRangeCache,
  type ByteRange,
  classifyRangeResponse,
  parseContentRangeStart,
  rangeRequestHeader,
  sliceSampleBytes,
  spanByteRange,
} from "./videoByteRange";

interface NativeInitMessage extends InitMessage {
  /** Resolved media URL for the source video. */
  videoSrc: string;
  /** Extra headers for the media fetch (auth); usually none for presigned. */
  headers?: Record<string, string>;
  /**
   * Capability probe only: stream just far enough to demux the `moov` +
   * `isConfigSupported`, post a `capability` verdict, and stop — no decode.
   * Drives the decode-strategy resolver (which then terminates this worker).
   */
  probeOnly?: boolean;
}

/** The `request` payload the native stream's `buildChunkRequest` produces. */
interface NativeChunkRequest {
  startFrame: number;
  numFrames: number;
}

/**
 * A demuxed sample, enriched with the mappings decode needs. Carries the
 * sample's byte location (from the `moov`), not its bytes — the encoded data is
 * range-fetched on demand when a chunk decodes.
 */
interface DemuxedSample {
  /** 1-indexed presentation-order frame number. */
  frameNumber: number;
  /** Position in decode order (index into `decodeOrder`). */
  decodeIndex: number;
  /** Presentation timestamp in integer microseconds (chunk/frame key). */
  tsMicros: number;
  /** Sample duration in microseconds. */
  durMicros: number;
  isSync: boolean;
  /** Absolute byte offset of the sample in the source file. */
  offset: number;
  /** Encoded byte length of the sample. */
  size: number;
}

/** Samples in decode order (as delivered by the demuxer). */
let decodeOrder: DemuxedSample[] = [];
/** Samples by 1-indexed presentation frame number (`[frame - 1]`). */
let byFrameNumber: DemuxedSample[] = [];
/** Decode-order indices of sync (keyframe) samples, ascending. */
let keyframeIndices: number[] = [];
/** Presentation-timestamp (µs) → 1-indexed frame number. */
const microsToFrame = new Map<number, number>();
let config: VideoDecoderConfig | null = null;
let totalFrames = 0;

/** Resolved media URL + fetch headers for the source video (set on init). */
let videoSrc = "";
let mediaHeaders: Record<string, string> | undefined;

/** Cap on cached encoded byte ranges — small next to the decoded-bitmap LRU. */
const RANGE_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;
const rangeCache = new ByteRangeCache(RANGE_CACHE_BUDGET_BYTES);
/**
 * Set once a server proves it won't honor `Range` (returned `200`, or the
 * ranged request failed CORS/preflight). From then on we serve every chunk
 * from `wholeFileBuffer` instead of retrying ranges.
 */
let rangeFetchDisabled = false;
/** The whole file, held only when we fell back to a non-ranged fetch. */
let wholeFileBuffer: ArrayBuffer | null = null;

let ready = false;
let unsupportedReason: string | null = null;

/** Chunk requests that arrived before demux finished. */
const pendingChunks: FetchChunkMessage[] = [];

let decoder: VideoDecoder | null = null;

/** The chunk decode currently in flight; output callback reads it. */
interface Job {
  reqId: number;
  startFrame: number;
  endFrame: number;
  kf: number;
  dEnd: number;
  pending: Promise<void>[];
}
let currentJob: Job | null = null;
/** Serializes decode jobs — the decoder is single, stateful. */
let jobChain: Promise<void> = Promise.resolve();

self.addEventListener("message", (event: MessageEvent<FrameWorkerInbound>) => {
  const msg = event.data;

  switch (msg.type) {
    case "init":
      void handleInit(msg as NativeInitMessage);
      break;

    case "fetchChunk":
      handleFetchChunk(msg);
      break;
  }
});

async function handleInit(msg: NativeInitMessage): Promise<void> {
  // Capability probe: demux the header only, report a verdict, and stop.
  if (msg.probeOnly) {
    await handleProbe(msg);
    return;
  }

  videoSrc = msg.videoSrc;
  mediaHeaders = msg.headers;

  try {
    await initSampleTable(msg.videoSrc, msg.headers);
  } catch (error) {
    // Demux/fetch failure is terminal for this source: fail everything queued
    // so the stream marks those frames failed and (later) falls back.
    unsupportedReason = errorMessage(error);
    ready = true;
    drainPending();

    return;
  }

  ready = true;
  drainPending();
}

/**
 * Parse the source's `moov` (streaming just far enough — see {@link streamMoov})
 * and build the data-less sample table + `VideoDecoderConfig` decode works from.
 * No `mdat` is fetched here; each sample's bytes are range-fetched on demand.
 */
async function initSampleTable(
  src: string,
  headers?: Record<string, string>,
): Promise<void> {
  const { file, track } = await streamMoov(src, headers);

  config = buildDecoderConfig(file, track);

  const support = await VideoDecoder.isConfigSupported(config);
  if (!support.supported) {
    throw new Error(`codec unsupported: ${config.codec}`);
  }

  // The sample table (offset/size/cts/is_sync per sample) comes straight from
  // the `moov`'s `stbl` — no `mdat` needed.
  const samples = file.getTrackSamplesInfo(track.id);
  if (!samples || samples.length === 0) {
    throw new Error("demux produced no samples");
  }

  buildSampleTable(samples, track.timescale);
}

/**
 * Capability probe: stream just enough of the source to demux its `moov`,
 * build a `VideoDecoderConfig`, and ask `isConfigSupported`. Posts a single
 * `capability` verdict and does no decode — the resolver terminates this worker
 * once it has the answer.
 */
async function handleProbe(msg: NativeInitMessage): Promise<void> {
  try {
    const { file, track } = await streamMoov(msg.videoSrc, msg.headers);
    const cfg = buildDecoderConfig(file, track);
    const support = await VideoDecoder.isConfigSupported(cfg);
    postCapability(
      Boolean(support.supported),
      cfg.codec,
      support.supported ? undefined : `codec unsupported: ${cfg.codec}`,
    );
  } catch (error) {
    postCapability(false, undefined, errorMessage(error));
  }
}

/**
 * Stream `src` through mp4box only until it parses the `moov` (the header
 * carrying codec, sample-description boxes, and the sample table), then stop —
 * so both the decodability probe and decode-init cost a few hundred KB, not the
 * whole clip. Faststart files resolve on the first read; a trailing `moov`
 * (non-faststart) degrades to reading the whole stream. Shared by the probe and
 * decode-init; the returned `file` has its sample table ready
 * (`getTrackSamplesInfo`).
 */
async function streamMoov(
  src: string,
  headers?: Record<string, string>,
): Promise<{ file: ISOFile; track: Movie["videoTracks"][number] }> {
  // `<video src>` semantics: cors, default credentials, no custom auth headers.
  const resp = await fetch(src, { mode: "cors", headers });
  if (!resp.ok) {
    throw new Error(`video fetch failed: ${resp.status}`);
  }

  const file = createFile();
  let videoTrack: Movie["videoTracks"][number] | null = null;
  let readyError: string | null = null;

  file.onError = (error: string) => {
    readyError = error;
  };

  file.onReady = (info: Movie) => {
    const track = info.videoTracks[0];
    if (!track) {
      readyError = "no video track";
      return;
    }

    videoTrack = track;
  };

  // No streaming body (some environments): fall back to a whole-file append.
  if (!resp.body) {
    const bytes = await resp.arrayBuffer();
    file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(bytes, 0), true);
  } else {
    const reader = resp.body.getReader();
    let offset = 0;

    while (!videoTrack && !readyError) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
      );
      file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(chunk, offset));
      offset += value.byteLength;
    }

    // We have (or failed to get) the header — don't drain the rest.
    void reader.cancel().catch(() => {});
  }

  if (readyError) {
    throw new Error(readyError);
  }

  if (!videoTrack) {
    throw new Error("demux produced no video track");
  }

  return { file, track: videoTrack };
}

/**
 * Turn raw demuxed samples into `decodeOrder` (decode order, as delivered),
 * assign each its 1-indexed presentation frame number (sort by `cts`), and
 * build the µs→frame map + keyframe index list.
 */
function buildSampleTable(samples: Sample[], timescale: number): void {
  decodeOrder = samples.map((s, decodeIndex) => ({
    frameNumber: 0, // filled below once we know presentation order
    decodeIndex,
    tsMicros: Math.round((s.cts * 1e6) / timescale),
    durMicros: Math.round((s.duration * 1e6) / timescale),
    isSync: Boolean(s.is_sync),
    offset: s.offset,
    size: s.size,
  }));

  // Presentation order = ascending composition timestamp. 1-indexed frame
  // numbers match `to_frames` / looker's ImaVid numbering (frame 1 = t≈0).
  byFrameNumber = [...decodeOrder].sort((a, b) => a.tsMicros - b.tsMicros);
  byFrameNumber.forEach((sample, i) => {
    sample.frameNumber = i + 1;
    microsToFrame.set(sample.tsMicros, sample.frameNumber);
  });

  keyframeIndices = decodeOrder
    .filter((s) => s.isSync)
    .map((s) => s.decodeIndex);

  totalFrames = decodeOrder.length;
}

/**
 * Extract the codec-private description (`avcC`/`hvcC`/`av1C`/`vpcC`) for the
 * `VideoDecoderConfig`. Walks the sample-description box tree; casts through
 * `any` because these are dynamic box shapes mp4box doesn't statically type.
 */
function buildDecoderConfig(
  file: ISOFile,
  track: Movie["videoTracks"][number],
): VideoDecoderConfig {
  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.track_width,
    codedHeight: track.track_height,
    // Random access decodes short spans from a keyframe; low latency helps.
    optimizeForLatency: true,
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const trak = file.getTrackById(track.id) as any;
  const entries: any[] = trak?.mdia?.minf?.stbl?.stsd?.entries ?? [];

  for (const entry of entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.av1C ?? entry.vpcC;
    if (!box) {
      continue;
    }

    const stream = new DataStream(undefined, 0);
    box.write(stream);
    // Drop the 8-byte box header (size + fourcc); WebCodecs wants the payload.
    config.description = new Uint8Array(stream.buffer, 8);
    break;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return config;
}

function handleFetchChunk(msg: FetchChunkMessage): void {
  if (!ready) {
    pendingChunks.push(msg);
    return;
  }

  if (unsupportedReason) {
    postFailed(msg.reqId, unsupportedReason);
    return;
  }

  enqueueJob(msg);
}

function drainPending(): void {
  const queued = pendingChunks.splice(0, pendingChunks.length);
  for (const msg of queued) {
    handleFetchChunk(msg);
  }
}

/** Chain a chunk decode after any in-flight one (the decoder is single). */
function enqueueJob(msg: FetchChunkMessage): void {
  jobChain = jobChain
    .then(() => runJob(msg))
    .catch((error) => {
      postFailed(msg.reqId, errorMessage(error));
    });
}

async function runJob(msg: FetchChunkMessage): Promise<void> {
  const request = msg.request as NativeChunkRequest;
  const startFrame = request.startFrame;
  const endFrame = Math.min(startFrame + request.numFrames - 1, totalFrames);

  // Presentation range → decode-order span → keyframe snap.
  let dStart = Number.POSITIVE_INFINITY;
  let dEnd = -1;
  for (let frame = startFrame; frame <= endFrame; frame++) {
    const sample = byFrameNumber[frame - 1];
    if (!sample) {
      continue;
    }

    dStart = Math.min(dStart, sample.decodeIndex);
    dEnd = Math.max(dEnd, sample.decodeIndex);
  }

  if (dEnd < 0) {
    // Nothing to decode (out-of-range request) — settle the chunk cleanly.
    post({
      type: "chunkDone",
      reqId: msg.reqId,
      range: [startFrame, endFrame],
    });
    return;
  }

  const kf = keyframeAtOrBefore(dStart);

  // Fetch just the bytes for this GOP span (keyframe → last needed sample).
  const range = spanByteRange(decodeOrder, kf, dEnd);
  if (!range) {
    post({
      type: "chunkDone",
      reqId: msg.reqId,
      range: [startFrame, endFrame],
    });
    return;
  }

  const span = await fetchSpanBuffer(range);

  const dec = ensureDecoder();
  dec.configure(config as VideoDecoderConfig);

  currentJob = {
    reqId: msg.reqId,
    startFrame,
    endFrame,
    kf,
    dEnd,
    pending: [],
  };

  for (let i = kf; i <= dEnd; i++) {
    const s = decodeOrder[i];
    dec.decode(
      new EncodedVideoChunk({
        type: s.isSync ? "key" : "delta",
        timestamp: s.tsMicros,
        duration: s.durMicros,
        data: sliceSampleBytes(span.buffer, span.fileStart, s),
      }),
    );
  }

  await dec.flush();
  await Promise.all(currentJob.pending);

  post({ type: "chunkDone", reqId: msg.reqId, range: [startFrame, endFrame] });
  currentJob = null;
}

/** A slice of the source file plus the absolute offset its byte 0 maps to. */
interface SpanBuffer {
  buffer: ArrayBuffer;
  /** Absolute file offset of `buffer[0]` (`0` for a whole-file buffer). */
  fileStart: number;
}

/**
 * Fetch the encoded bytes covering `range`, preferring an HTTP `Range` request
 * so decode streams on demand rather than downloading the whole clip. Degrades
 * gracefully:
 *
 * - `206` — the body is exactly the range; cache it and slice at `range.start`.
 * - `200` — the server ignored `Range` and sent the whole file; keep it and
 *   serve every future chunk from it (no more network).
 * - ranged request rejected / failed (`416`, CORS preflight on a bucket without
 *   `OPTIONS`, …) — fall back once to a plain (no-`Range`) whole-file fetch,
 *   matching `<video src>` semantics, and latch off ranges.
 *
 * Never fabricates bytes: a hard fetch failure throws, failing the chunk.
 */
async function fetchSpanBuffer(range: ByteRange): Promise<SpanBuffer> {
  // Server already proved it won't range-serve — everything lives in memory.
  if (rangeFetchDisabled && wholeFileBuffer) {
    return { buffer: wholeFileBuffer, fileStart: 0 };
  }

  const cached = rangeCache.get(range);
  if (cached) {
    return { buffer: cached, fileStart: range.start };
  }

  if (!rangeFetchDisabled) {
    try {
      const resp = await fetch(videoSrc, {
        mode: "cors",
        headers: { ...mediaHeaders, Range: rangeRequestHeader(range) },
      });
      const kind = classifyRangeResponse(resp.status);

      if (kind === "range") {
        const buffer = await resp.arrayBuffer();
        const fileStart =
          parseContentRangeStart(resp.headers.get("Content-Range")) ??
          range.start;
        rangeCache.set(range, buffer);
        return { buffer, fileStart };
      }

      if (kind === "whole") {
        // Ranges ignored — take the whole file we were handed and stop asking.
        rangeFetchDisabled = true;
        wholeFileBuffer = await resp.arrayBuffer();
        return { buffer: wholeFileBuffer, fileStart: 0 };
      }

      // Unexpected status (e.g. 416): abandon ranges, fall through to whole.
      rangeFetchDisabled = true;
    } catch {
      // Network / CORS-preflight failure on the ranged request — abandon
      // ranges and fall through to a plain whole-file fetch.
      rangeFetchDisabled = true;
    }
  }

  return { buffer: await fetchWholeFile(), fileStart: 0 };
}

/** Plain (no-`Range`) whole-file fetch; the result is memoized for reuse. */
async function fetchWholeFile(): Promise<ArrayBuffer> {
  if (wholeFileBuffer) {
    return wholeFileBuffer;
  }

  const resp = await fetch(videoSrc, { mode: "cors", headers: mediaHeaders });
  if (!resp.ok) {
    throw new Error(`video fetch failed: ${resp.status}`);
  }

  wholeFileBuffer = await resp.arrayBuffer();
  return wholeFileBuffer;
}

function ensureDecoder(): VideoDecoder {
  if (decoder) {
    return decoder;
  }

  decoder = new VideoDecoder({
    output: onDecoderOutput,
    // A decoder error fails the current chunk; the base re-requests it on the
    // next prefetch, so there is nothing to recover here.
    error: () => {},
  });

  return decoder;
}

function onDecoderOutput(frame: VideoFrame): void {
  const job = currentJob;
  const frameNumber = microsToFrame.get(frame.timestamp);

  if (job == null || frameNumber == null) {
    // A frame we can't place (stray timestamp) — drop it; never leak.
    frame.close();
    return;
  }

  const width = frame.displayWidth;
  const height = frame.displayHeight;
  const timestamp = frame.timestamp;

  // `VideoFrame` must be closed promptly (small decoder pool). Convert to a
  // transferable bitmap, then close.
  const p = createImageBitmap(frame)
    .then((bitmap) => {
      post(
        {
          type: "frameReady",
          reqId: job.reqId,
          frameNumber,
          bitmap,
          width,
          height,
          meta: { timestamp },
        },
        [bitmap],
      );
    })
    .catch(() => {
      // Skip a single bad frame — the stream re-requests on the next prefetch.
    })
    .finally(() => {
      frame.close();
    });

  job.pending.push(p);
}

/** Largest keyframe decode-index at or before `decodeIndex`. */
function keyframeAtOrBefore(decodeIndex: number): number {
  let kf = 0;
  for (const k of keyframeIndices) {
    if (k <= decodeIndex) {
      kf = k;
    } else {
      break;
    }
  }

  return kf;
}

function post(msg: FrameWorkerOutbound, transfer?: Transferable[]): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    msg,
    transfer ?? [],
  );
}

function postFailed(reqId: number, error: string): void {
  post({ type: "chunkFailed", reqId, error });
}

function postCapability(
  decodable: boolean,
  codec?: string,
  reason?: string,
): void {
  const msg: CapabilityMessage = {
    type: "capability",
    decodable,
    codec,
    reason,
  };
  post(msg);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
