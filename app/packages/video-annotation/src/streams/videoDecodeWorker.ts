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
  FetchChunkMessage,
  FrameWorkerInbound,
  FrameWorkerOutbound,
  InitMessage,
} from "./frameWorkerProtocol";

interface NativeInitMessage extends InitMessage {
  /** Resolved media URL for the source video. */
  videoSrc: string;
  /** Extra headers for the media fetch (auth); usually none for presigned. */
  headers?: Record<string, string>;
  /** Phase-1 frame-exactness instrumentation. */
  debug?: boolean;
}

/** The `request` payload the native stream's `buildChunkRequest` produces. */
interface NativeChunkRequest {
  startFrame: number;
  numFrames: number;
}

/** A demuxed sample, enriched with the mappings decode needs. */
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
  data: Uint8Array;
}

let debug = false;

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
  debug = msg.debug ?? false;

  try {
    const bytes = await fetchVideoBytes(msg.videoSrc, msg.headers);
    await demux(bytes);
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

async function fetchVideoBytes(
  videoSrc: string,
  headers?: Record<string, string>,
): Promise<ArrayBuffer> {
  // Match `<video src>` semantics: default credentials, cors. Whole-file fetch
  // for now — mp4box parses progressively, so byte-range streaming is a later
  // optimization (see design §5).
  const resp = await fetch(videoSrc, { mode: "cors", headers });
  if (!resp.ok) {
    throw new Error(`video fetch failed: ${resp.status}`);
  }

  return resp.arrayBuffer();
}

/**
 * Demux `bytes` into a sample table + a `VideoDecoderConfig`. Builds the
 * presentation-order frame numbering and the µs→frame map decode assigns by.
 */
async function demux(bytes: ArrayBuffer): Promise<void> {
  const file = createFile();
  const collected: Sample[] = [];
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
    config = buildDecoderConfig(file, track);
    // Request every sample in one shot; `flush` forces delivery of the tail.
    file.setExtractionOptions(track.id, null, { nbSamples: track.nb_samples });
    file.start();
  };

  file.onSamples = (_id: number, _user: unknown, samples: Sample[]) => {
    for (const s of samples) {
      collected.push(s);
    }
  };

  const mbuf = MP4BoxBuffer.fromArrayBuffer(bytes, 0);
  file.appendBuffer(mbuf, true);
  file.flush();

  if (readyError) {
    throw new Error(readyError);
  }

  if (!videoTrack || !config) {
    throw new Error("demux produced no video track / decoder config");
  }

  if (collected.length === 0) {
    throw new Error("demux produced no samples");
  }

  if (debug) {
    const d = config.description as Uint8Array | undefined;
    const head = d ? Array.from(d.slice(0, 6)) : null;
    log(
      `config: codec=${config.codec} ${config.codedWidth}x${config.codedHeight} ` +
        `descLen=${d?.byteLength ?? "none"} descHead=${JSON.stringify(head)}`,
    );
  }

  const support = await VideoDecoder.isConfigSupported(config);
  if (debug) {
    log(`isConfigSupported => ${JSON.stringify(support?.supported)}`);
  }
  if (!support.supported) {
    throw new Error(`codec unsupported: ${config.codec}`);
  }

  buildSampleTable(
    collected,
    (videoTrack as Movie["videoTracks"][number]).timescale,
  );
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
    data: (s.data ?? new Uint8Array(0)) as Uint8Array,
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

  if (debug) {
    log(
      `demux ok: ${totalFrames} frames, ${keyframeIndices.length} keyframes, ` +
        `codec=${config?.codec}`,
    );
  }
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

  const t0 = debug ? performance.now() : 0;

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
        data: s.data,
      }),
    );
  }

  await dec.flush();
  await Promise.all(currentJob.pending);

  if (debug) {
    const dt = (performance.now() - t0).toFixed(1);
    log(
      `chunk req=${msg.reqId} frames[${startFrame}..${endFrame}] ` +
        `kf-snap=${decodeOrder[kf]?.frameNumber} lead-in=${dStart - kf} ` +
        `decoded=${currentJob.pending.length} in ${dt}ms`,
    );
  }

  post({ type: "chunkDone", reqId: msg.reqId, range: [startFrame, endFrame] });
  currentJob = null;
}

function ensureDecoder(): VideoDecoder {
  if (decoder) {
    return decoder;
  }

  decoder = new VideoDecoder({
    output: onDecoderOutput,
    error: (error: DOMException) => {
      if (debug) {
        log(`decoder error: ${error.message}`);
      }
    },
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

      if (debug) {
        log(`  frame ${frameNumber} decoded (ts=${timestamp})`);
      }
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

function log(message: string): void {
  console.log(`[native-decode] ${message}`);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
