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
 * them. This gives single-clock lock-step playback WITHOUT the
 * `to_frames` preprocessing/storage cost.
 *
 * Frame-exactness (the load-bearing property): the demuxer's sample table maps
 * each frame's presentation timestamp (`cts`) to a 1-indexed frame number. We
 * stamp every `EncodedVideoChunk` with that timestamp; the decoder echoes it
 * onto the output `VideoFrame`, so we can assign the correct frame number on
 * the way out regardless of decode order (B-frames) or GOP boundaries. Frame
 * 1 is the first sample at or after the edit list's start, as in ffmpeg.
 *
 * GOP handling lives entirely here (the stream base stays source-agnostic): a
 * chunk request for presentation frames `[start, start+n)` is snapped back to
 * the keyframe at/-before the earliest of those frames in DECODE order, and we
 * decode forward through the latest. Lead-in frames are emitted as bonus —
 * they're already decoded and help scrub-back. The sync table is verified
 * against sample bytes before a snap relies on it (see {@link KeyframeIndex}),
 * an all-intra picture the table flags can start the decode where the browser
 * allows it (see {@link ./intraStartProbe}), and a chunk whose samples pick up
 * where the previous chunks left off continues the open decoder instead of
 * snapping back, feeding only the samples not yet fed (see
 * {@link DecodeSession}). A decoder holds finished frames until later input
 * arrives, so chunks are settled by attributing frames as they land, not by
 * flushing at each boundary (see {@link ChunkLedger}).
 *
 * Sample bytes come from HTTP `Range` requests, so the media server must
 * answer them with `206`; one that doesn't fails every chunk (see
 * {@link RangeFetcher}).
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
  type EditListEntry,
  presentationStart,
  presentedInOrder,
} from "./editList";
import {
  ChunkLedger,
  type ChunkSpan,
  chunkSpan,
  type OwedChunk,
} from "./chunkLedger";
import { DecodeSession } from "./decodeSession";
import { decodesAsStart, intraStarts } from "./intraStartProbe";
import { type Gop, KeyframeIndex } from "./keyframeIndex";
import { keyframeProbe } from "./sampleKeyframe";
import {
  ByteRangeCache,
  RangeFetcher,
  rangeRequestHeader,
  sliceSampleBytes,
  type SpanBuffer,
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
/** Keyframes to snap to, verified against their bytes before use. */
let keyframes = new KeyframeIndex([], keyframeProbe(""));
/** Presentation-timestamp (µs) → 1-indexed frame number. */
const microsToFrame = new Map<number, number>();
let config: VideoDecoderConfig | null = null;
let totalFrames = 0;

/** Resolved media URL + fetch headers for the source video (set on init). */
let videoSrc = "";
let mediaHeaders: Record<string, string> | undefined;

/** Cap on cached encoded byte ranges — small next to the decoded-bitmap LRU. */
const RANGE_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;
/** Sample bytes come only from `Range` requests; see {@link RangeFetcher}. */
const ranges = new RangeFetcher(
  (range) =>
    fetch(videoSrc, {
      mode: "cors",
      headers: { ...mediaHeaders, Range: rangeRequestHeader(range) },
    }),
  new ByteRangeCache(RANGE_CACHE_BUDGET_BYTES),
);

let ready = false;
let unsupportedReason: string | null = null;

/** Chunk requests that arrived before demux finished. */
const pendingChunks: FetchChunkMessage[] = [];

let session: DecodeSession | null = null;

/**
 * How long after the last sample is fed to force the decoder's held frames
 * out. During playback the next chunk's input pushes them along; this covers
 * the tail, when nothing more is coming.
 */
const IDLE_FLUSH_MS = 120;
/** A chunk being decoded: the frames it still owes, and their bitmap work. */
interface Job extends OwedChunk {
  pending: Promise<void>[];
}
const ledger = new ChunkLedger<Job>();
let idleFlushTimer: ReturnType<typeof setTimeout> | null = null;
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

  buildSampleTable(samples, track.timescale, track.edits);
}

/**
 * Capability probe: stream just enough of the source to demux its `moov`,
 * build a `VideoDecoderConfig`, and ask `isConfigSupported`. Posts a single
 * `capability` verdict and does no decode — the resolver terminates this worker
 * once it has the answer.
 */
async function handleProbe(msg: NativeInitMessage): Promise<void> {
  try {
    const { file, track, hasAudio } = await streamMoov(
      msg.videoSrc,
      msg.headers,
    );
    const cfg = buildDecoderConfig(file, track);
    const support = await VideoDecoder.isConfigSupported(cfg);
    postCapability(
      Boolean(support.supported),
      cfg.codec,
      support.supported ? undefined : `codec unsupported: ${cfg.codec}`,
      hasAudio,
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
): Promise<{
  file: ISOFile;
  track: Movie["videoTracks"][number];
  /** Whether the `moov`'s track table lists an audio track. */
  hasAudio: boolean;
}> {
  // `<video src>` semantics: cors, default credentials, no custom auth headers.
  const resp = await fetch(src, { mode: "cors", headers });
  if (!resp.ok) {
    throw new Error(`video fetch failed: ${resp.status}`);
  }

  const file = createFile();
  let videoTrack: Movie["videoTracks"][number] | null = null;
  let hasAudio = false;
  let readyError: string | null = null;

  file.onError = (error: string) => {
    readyError = error;
  };

  file.onReady = (info: Movie) => {
    hasAudio = (info.audioTracks?.length ?? 0) > 0;

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

  return { file, track: videoTrack, hasAudio };
}

/**
 * Build `decodeOrder` (as delivered), number the presented samples 1..N by
 * `cts`, and index keyframes. Pre-roll samples stay in `decodeOrder` — the GOP
 * keyframe is usually one — but get no frame number, so {@link onDecoderOutput}
 * drops their output.
 */
function buildSampleTable(
  samples: Sample[],
  timescale: number,
  edits: readonly EditListEntry[] | undefined,
): void {
  decodeOrder = samples.map((s, decodeIndex) => ({
    frameNumber: 0,
    decodeIndex,
    tsMicros: Math.round((s.cts * 1e6) / timescale),
    durMicros: Math.round((s.duration * 1e6) / timescale),
    isSync: Boolean(s.is_sync),
    offset: s.offset,
    size: s.size,
  }));

  const presented = presentedInOrder(
    samples.map((s, decodeIndex) => ({ cts: s.cts, decodeIndex })),
    presentationStart(edits),
  );

  byFrameNumber = presented.map((p) => decodeOrder[p.decodeIndex]);
  byFrameNumber.forEach((sample, i) => {
    sample.frameNumber = i + 1;
    microsToFrame.set(sample.tsMicros, sample.frameNumber);
  });

  const cfg = config as VideoDecoderConfig;
  const probe = keyframeProbe(
    cfg.codec,
    cfg.description as Uint8Array | undefined,
  );
  // With reordering, the pictures decoded after an intra start but presented
  // before it may reference the previous GOP, so only an IDR is safe.
  const reorders = decodeOrder.some(
    (s, i) => i > 0 && s.tsMicros < decodeOrder[i - 1].tsMicros,
  );
  keyframes = new KeyframeIndex(
    decodeOrder,
    probe,
    probe.family === "avc" && !reorders
      ? intraStarts(probe.nalLengthSize, (chunk) => decodesAsStart(cfg, chunk))
      : undefined,
  );

  totalFrames = byFrameNumber.length;
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

/**
 * Feeding the decoder is serialized, because the decoder is single and
 * stateful. Fetching a chunk's bytes is not, and it is the slow half, so it
 * starts the moment the request arrives and runs while the chunk ahead is
 * still decoding.
 */
function enqueueJob(msg: FetchChunkMessage): void {
  const prepared = prepareSpan(msg);
  jobChain = jobChain
    .then(() => runJob(msg, prepared))
    .catch((error) => {
      postFailed(msg.reqId, errorMessage(error));
    });
}

/** A chunk's decode-order span, with the bytes covering it already in flight. */
interface PreparedSpan {
  startFrame: number;
  endFrame: number;
  /** `null` when no requested frame has a sample. */
  samples: ChunkSpan | null;
  span: Promise<SpanBuffer | null>;
}

/**
 * Resolve which samples a request needs and start fetching them. The span
 * assumes the decoder will still be where this chunk begins, which is the
 * sequential-playback case; a chunk that turns out to need a keyframe snap
 * fetches the longer span when it is fed.
 */
function prepareSpan(msg: FetchChunkMessage): PreparedSpan {
  const request = msg.request as NativeChunkRequest;
  const startFrame = request.startFrame;
  const endFrame = Math.min(startFrame + request.numFrames - 1, totalFrames);
  const samples = chunkSpan(decodeOrder, decodeIndexOf, startFrame, endFrame);

  return {
    startFrame,
    endFrame,
    samples,
    // A failed speculative fetch is not an error yet: the feed step decides,
    // and may need a different span anyway.
    span: !samples
      ? Promise.resolve(null)
      : fetchFrom(samples.dFirst, samples.dEnd)
          .then((result) => result?.span ?? null)
          .catch(() => null),
  };
}

async function runJob(
  msg: FetchChunkMessage,
  prepared: PreparedSpan,
): Promise<void> {
  const { startFrame, endFrame, samples } = prepared;

  if (!samples) {
    // Nothing to decode (out-of-range request) — settle the chunk cleanly.
    post({
      type: "chunkDone",
      reqId: msg.reqId,
      range: [startFrame, endFrame],
    });
    return;
  }

  const dec = ensureSession();
  // Nothing is idle while a chunk is being prepared: an idle flush landing
  // mid-fetch would end continuity behind this job's back.
  cancelIdleFlush();

  try {
    await feedJob(msg.reqId, prepared, samples, dec);
  } finally {
    // The decoder keeps the tail of what was fed until more input comes; the
    // idle flush covers the case where none does.
    scheduleIdleFlush();
  }
}

async function feedJob(
  reqId: number,
  prepared: PreparedSpan,
  { dFirst, dStart, dEnd }: ChunkSpan,
  dec: DecodeSession,
): Promise<void> {
  const { startFrame, endFrame } = prepared;

  // The speculative fetch covers this span; it is enough only if the chunk
  // continues the open decoder. Read that AFTER the fetch, since a flush
  // during it moves the decoder. Otherwise snap back to a verified keyframe,
  // which needs the longer span.
  const ready = await prepared.span;
  const fedThrough =
    ready && dec.canContinue(dFirst) && ledger.follows(startFrame)
      ? dec.fedThrough
      : null;

  let gop: Gop | null;
  if (ready && fedThrough !== null) {
    gop = { kf: fedThrough + 1, span: ready };
  } else {
    gop = await keyframes.resolveGop(dStart, (kf) => fetchFrom(kf, dEnd));
    if (gop) {
      // A restart discards whatever the decoder still holds, so let the
      // frames already fed arrive and settle their chunks first.
      await flushOutstanding();
      dec.restart(config as VideoDecoderConfig);
      ledger.restart();
    }
  }

  const job: Job = {
    reqId,
    startFrame,
    endFrame,
    expected: new Set<number>(),
    pending: [],
  };
  if (gop) {
    ledger.open(job, decodeIndexOf, fedThrough);
  }

  if (!gop || job.expected.size === 0) {
    post({ type: "chunkDone", reqId, range: [startFrame, endFrame] });
    return;
  }

  // `kf` is where feeding resumes: the snap target, or the sample after the
  // last one fed.
  const { kf, span, start } = gop;
  for (let i = kf; i <= dEnd; i++) {
    const s = decodeOrder[i];
    const data =
      i === kf && start
        ? start
        : sliceSampleBytes(span.buffer, span.fileStart, s);
    ledger.fed(s.frameNumber, reqId);
    dec.decode(
      new EncodedVideoChunk({
        type: i === kf && start ? "key" : keyframes.chunkType(s, data),
        timestamp: s.tsMicros,
        duration: s.durMicros,
        data,
      }),
      i,
    );
  }
}

/**
 * Report a chunk complete once every frame it owed has been posted. Frames the
 * decoder never produced leave the chunk short, and the stream marks those
 * frames failed off the back of this message.
 */
async function settleJob(job: Job): Promise<void> {
  if (!ledger.settle(job)) {
    return;
  }

  await Promise.all(job.pending);
  post({
    type: "chunkDone",
    reqId: job.reqId,
    range: [job.startFrame, job.endFrame],
  });
}

function cancelIdleFlush(): void {
  if (idleFlushTimer !== null) {
    clearTimeout(idleFlushTimer);
    idleFlushTimer = null;
  }
}

function scheduleIdleFlush(): void {
  cancelIdleFlush();

  idleFlushTimer = setTimeout(() => {
    idleFlushTimer = null;
    void flushOutstanding();
  }, IDLE_FLUSH_MS);
}

/** Force out the frames the decoder holds, then settle whatever is still owed. */
async function flushOutstanding(): Promise<void> {
  cancelIdleFlush();

  if (!session || ledger.pending.length === 0) {
    return;
  }

  await session.flush();

  for (const job of [...ledger.pending]) {
    await settleJob(job);
  }
}

/** Bytes for decode-order samples `[kf, dEnd]`, or `null` when there are none. */
async function fetchFrom(
  kf: number,
  dEnd: number,
): Promise<{ kf: number; span: SpanBuffer } | null> {
  const range = spanByteRange(decodeOrder, kf, dEnd);
  if (!range) {
    return null;
  }

  return { kf, span: await ranges.fetch(range) };
}

function decodeIndexOf(frame: number): number | undefined {
  return byFrameNumber[frame - 1]?.decodeIndex;
}

function ensureSession(): DecodeSession {
  if (!session) {
    session = new DecodeSession(onDecoderOutput, () => {
      // The frames already fed will never arrive; settle their chunks so the
      // stream can mark them failed instead of waiting forever.
      for (const job of [...ledger.pending]) {
        void settleJob(job);
      }
    });
  }

  return session;
}

/**
 * Post a decoded frame: to the chunk that owes it, or as a bonus frame the
 * stream may cache. A frame no chunk carried (pre-roll, or a timestamp we can't
 * place) is dropped.
 */
function onDecoderOutput(frame: VideoFrame): void {
  const frameNumber = microsToFrame.get(frame.timestamp);
  const destination = ledger.output(frameNumber);

  if (frameNumber === undefined || !destination) {
    frame.close();
    return;
  }

  const { chunk: job, reqId } = destination;
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
          reqId,
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

  if (!job) {
    return;
  }

  job.pending.push(p);

  if (job.expected.size === 0) {
    void settleJob(job);
  }
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
  hasAudio?: boolean,
): void {
  const msg: CapabilityMessage = {
    type: "capability",
    decodable,
    codec,
    reason,
    hasAudio,
  };
  post(msg);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
