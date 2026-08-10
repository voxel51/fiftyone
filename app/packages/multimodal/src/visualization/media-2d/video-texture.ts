import * as THREE from "three";

import type { EncodedVideoVisualization } from "../../ir";
import {
  H264_DECODE_STALL_TIMEOUT_MS,
  MAX_H264_DECODE_IN_FLIGHT_FRAMES,
  MAX_H264_DECODE_RUNWAY_FRAMES,
} from "../../codecs/h264-decode-policy";
import { h264AccessUnitWithParameterSets } from "../../codecs/h264-annexb";
import { toError } from "../../utils/errors";
import type { ImageTextureHandle } from "./Base2dScene";

/** Maximum number of WebCodecs decoder instances owned at once. */
export const VIDEO_DECODE_SESSION_CAP = 6;
const NANOSECONDS_PER_MICROSECOND = 1000n;

/** Expected decoder state that can resolve once more stream data arrives. */
export class VideoTextureWaitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoTextureWaitError";
  }
}

class VideoTextureCancelledError extends Error {
  constructor() {
    super("H.264 decode request was superseded");
    this.name = "VideoTextureCancelledError";
  }
}

type EncodedVideoChunkType = "key" | "delta";

interface EncodedVideoChunkLike {
  readonly data: BufferSource;
  readonly timestamp: number;
  readonly type: EncodedVideoChunkType;
}

interface EncodedVideoChunkConstructor {
  new (init: EncodedVideoChunkLike): unknown;
}

interface VideoFrameLike {
  readonly codedHeight?: number;
  readonly codedWidth?: number;
  readonly displayHeight?: number;
  readonly displayWidth?: number;
  readonly timestamp?: number;
  close?: () => void;
}

interface VideoDecoderConfigLike {
  readonly codec: string;
  readonly hardwareAcceleration?: "no-preference" | "prefer-hardware";
  readonly optimizeForLatency?: boolean;
}

interface VideoDecoderLike {
  close(): void;
  configure(config: VideoDecoderConfigLike): void;
  decode(chunk: unknown): void;
  reset(): void;
}

interface VideoDecoderConstructor {
  new (init: {
    error: (error: unknown) => void;
    output: (frame: VideoFrameLike) => void;
  }): VideoDecoderLike;
  isConfigSupported?: (
    config: VideoDecoderConfigLike,
  ) => Promise<{ readonly supported?: boolean }>;
}

interface PendingVideoFrame {
  readonly onProgress: () => void;
  readonly reject: (error: Error) => void;
  readonly resolve: (frame: VideoFrameLike | undefined) => void;
  readonly retain: boolean;
  readonly timestampUs: number;
}

interface DecodeJob {
  readonly frames: readonly EncodedVideoVisualization[];
  readonly reject: (error: Error) => void;
  readonly resolve: (frame: VideoFrameLike) => void;
  readonly signal?: AbortSignal;
  abortListener?: () => void;
  started: boolean;
}

interface RegisteredVideoSession {
  readonly session: H264VideoDecodeSession;
  refCount: number;
}

/** One mounted view's ownership of a shared per-source/per-stream session. */
export interface EncodedVideoSessionOwner {
  readonly sessionKey: string;
  decodeCanvas(
    frame: EncodedVideoVisualization,
    signal?: AbortSignal,
  ): Promise<HTMLCanvasElement>;
  decodeTexture(
    frame: EncodedVideoVisualization,
    decodeRunway?: readonly EncodedVideoVisualization[],
    signal?: AbortSignal,
  ): Promise<ImageTextureHandle>;
  release(): void;
}

/** Runtime ownership and scheduler counters used by focused diagnostics/tests. */
export interface VideoTextureDecoderStats {
  readonly decoderSlotCount: number;
  readonly ownerCount: number;
  readonly sessionCount: number;
  readonly waitingSessionCount: number;
}

/**
 * Claims the shared session for the frame's recording/stream. The claim must
 * live for the mounted view (or another explicit source owner), not one frame.
 */
export function acquireEncodedVideoSession(
  frame: EncodedVideoVisualization,
  textureKey: string | undefined,
): EncodedVideoSessionOwner {
  const sessionKey = encodedVideoSessionKey(textureKey, frame);
  let registered = sessions.get(sessionKey);
  if (!registered) {
    registered = {
      refCount: 0,
      session: new H264VideoDecodeSession(decoderSlots),
    };
    sessions.set(sessionKey, registered);
  }
  const ownedSession = registered;
  ownedSession.refCount += 1;

  let released = false;
  return {
    sessionKey,
    decodeCanvas: async (requestedFrame, signal) => {
      const output = await ownedSession.session.decodeVideoFrame(
        requestedFrame,
        signal,
      );
      try {
        return canvasFromVideoFrame(output);
      } finally {
        closeVideoFrame(output);
      }
    },
    decodeTexture: async (requestedFrame, decodeRunway = [], signal) => {
      const output = await ownedSession.session.decode(
        requestedFrame,
        decodeRunway,
        signal,
      );
      return textureFromVideoFrame(output);
    },
    release: () => {
      if (released) return;
      released = true;
      const current = sessions.get(sessionKey);
      if (!current || current !== ownedSession) return;
      current.refCount -= 1;
      if (current.refCount > 0) return;
      current.session.close();
      sessions.delete(sessionKey);
    },
  };
}

/**
 * Decodes an encoded video visualization into a disposable Three texture.
 * Production mounted views pass an owner; the ownerless form is a one-shot
 * convenience for isolated callers and tests.
 */
export async function createEncodedVideoTexture(
  frame: EncodedVideoVisualization,
  textureKey: string | undefined,
  decodeRunway: readonly EncodedVideoVisualization[] = [],
  owner?: EncodedVideoSessionOwner,
  signal?: AbortSignal,
): Promise<ImageTextureHandle> {
  if (frame.codec !== "h264") {
    throw new Error(`Video codec '${frame.codec}' is unsupported`);
  }

  const sessionOwner = owner ?? acquireEncodedVideoSession(frame, textureKey);
  try {
    return await sessionOwner.decodeTexture(frame, decodeRunway, signal);
  } finally {
    if (!owner) sessionOwner.release();
  }
}

/** Decodes an encoded video visualization into a GPU-free preview canvas. */
export async function createEncodedVideoCanvas(
  frame: EncodedVideoVisualization,
  textureKey: string | undefined,
  owner?: EncodedVideoSessionOwner,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  if (frame.codec !== "h264") {
    throw new Error(`Video codec '${frame.codec}' is unsupported`);
  }

  const sessionOwner = owner ?? acquireEncodedVideoSession(frame, textureKey);
  try {
    return await sessionOwner.decodeCanvas(frame, signal);
  } finally {
    if (!owner) sessionOwner.release();
  }
}

/** Closes every decoder owned by one recording/source boundary. */
export function releaseEncodedVideoSessionsForSource(sourceKey: string): void {
  if (!sourceKey) return;
  for (const [sessionKey, registered] of sessions) {
    if (sessionKey === sourceKey || sessionKey.startsWith(`${sourceKey}\n`)) {
      registered.session.close();
      sessions.delete(sessionKey);
    }
  }
}

/** Legacy force-release for a precisely identified session. */
export function releaseEncodedVideoSession(
  frame: EncodedVideoVisualization,
  textureKey: string | undefined,
): void {
  const sessionKey = encodedVideoSessionKey(textureKey, frame);
  const registered = sessions.get(sessionKey);
  if (!registered) return;
  registered.session.close();
  sessions.delete(sessionKey);
}

/** Clears shared WebCodecs sessions and synthetic timestamps between tests. */
export function resetVideoTextureDecodersForTests(): void {
  for (const registered of sessions.values()) {
    registered.session.close();
  }
  sessions.clear();
  decoderSlots.reset();
  syntheticTimestampUs = 0;
}

export function videoTextureDecoderStats(): VideoTextureDecoderStats {
  let ownerCount = 0;
  for (const registered of sessions.values()) {
    ownerCount += registered.refCount;
  }
  return {
    decoderSlotCount: decoderSlots.slotCount,
    ownerCount,
    sessionCount: sessions.size,
    waitingSessionCount: decoderSlots.waitingCount,
  };
}

export function encodedVideoSessionKey(
  textureKey: string | undefined,
  frame: EncodedVideoVisualization,
): string {
  if (!textureKey) {
    return [
      "keyless-video",
      frame.coordinateFrameId ?? "",
      frame.format,
      frame.codec,
    ].join("\n");
  }

  const firstSeparator = textureKey.indexOf("\n");
  const secondSeparator =
    firstSeparator >= 0 ? textureKey.indexOf("\n", firstSeparator + 1) : -1;
  return secondSeparator >= 0
    ? textureKey.slice(0, secondSeparator)
    : textureKey;
}

class H264VideoDecodeSession {
  private activeJob: DecodeJob | null = null;
  private cancelledPrerequisites: EncodedVideoVisualization[] = [];
  private closed = false;
  private codecString: string | undefined;
  private configuredCodecString: string | undefined;
  private decoder: VideoDecoderLike | null = null;
  private dependencyGap = false;
  private dependencyRunway: EncodedVideoVisualization[] = [];
  private lastTimestampUs: number | undefined;
  private pending: PendingVideoFrame[] = [];
  private pps: Uint8Array | undefined;
  private readonly queuedJobs: DecodeJob[] = [];
  private sps: Uint8Array | undefined;

  constructor(private readonly slots: VideoDecoderSlotScheduler) {}

  async decode(
    frame: EncodedVideoVisualization,
    decodeRunway: readonly EncodedVideoVisualization[],
    signal?: AbortSignal,
  ): Promise<VideoFrameLike> {
    return this.enqueueDecode([...decodeRunway, frame], signal);
  }

  async decodeVideoFrame(
    frame: EncodedVideoVisualization,
    signal?: AbortSignal,
  ): Promise<VideoFrameLike> {
    return this.enqueueDecode([frame], signal);
  }

  canParkDecoder(): boolean {
    return !this.closed && this.activeJob === null;
  }

  parkDecoder(): void {
    if (!this.canParkDecoder()) return;
    this.disposeDecoder();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const error = new Error("Video decoder closed");
    this.rejectPending(error);
    this.activeJob?.reject(error);
    this.activeJob = null;
    for (const job of this.queuedJobs.splice(0)) {
      this.removeAbortListener(job);
      job.reject(error);
    }
    this.cancelledPrerequisites = [];
    this.dependencyGap = false;
    this.dependencyRunway = [];
    this.disposeDecoder();
    this.slots.release(this);
  }

  private enqueueDecode(
    requestedFrames: readonly EncodedVideoVisualization[],
    signal?: AbortSignal,
  ): Promise<VideoFrameLike> {
    if (this.closed) return Promise.reject(new Error("Video decoder closed"));
    if (signal?.aborted)
      return Promise.reject(new VideoTextureCancelledError());

    const frames = this.mergeCancelledPrerequisites(requestedFrames);
    let resolve!: (frame: VideoFrameLike) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<VideoFrameLike>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const job: DecodeJob = {
      frames,
      reject,
      resolve,
      signal,
      started: false,
    };
    if (signal) {
      job.abortListener = () => this.cancelQueuedJob(job);
      signal.addEventListener("abort", job.abortListener, { once: true });
    }
    this.queuedJobs.push(job);
    this.pumpJobs();
    return promise;
  }

  private cancelQueuedJob(job: DecodeJob): void {
    if (job.started) return;
    const index = this.queuedJobs.indexOf(job);
    if (index < 0) return;
    this.queuedJobs.splice(index, 1);
    this.removeAbortListener(job);
    this.rememberCancelledPrerequisites(job.frames);
    job.reject(new VideoTextureCancelledError());
  }

  private pumpJobs(): void {
    if (this.closed || this.activeJob) return;
    const job = this.queuedJobs.shift();
    if (!job) return;
    if (job.signal?.aborted) {
      this.removeAbortListener(job);
      this.rememberCancelledPrerequisites(job.frames);
      job.reject(new VideoTextureCancelledError());
      this.pumpJobs();
      return;
    }

    job.started = true;
    this.activeJob = job;
    void this.decodeVideoFrameBatch(job.frames)
      .then(
        (output) => {
          if (job.signal?.aborted) {
            closeVideoFrame(output);
            job.reject(new VideoTextureCancelledError());
          } else {
            job.resolve(output);
          }
        },
        (error: unknown) => job.reject(toError(error)),
      )
      .finally(() => {
        this.removeAbortListener(job);
        if (this.activeJob === job) this.activeJob = null;
        if (this.queuedJobs.length === 0) {
          this.slots.sessionBecameIdle(this);
        }
        this.pumpJobs();
      });
  }

  private async decodeVideoFrameBatch(
    frames: readonly EncodedVideoVisualization[],
  ): Promise<VideoFrameLike> {
    const target = frames.at(-1);
    if (target?.codec !== "h264" || !target.h264?.hasFrame) {
      throw new VideoTextureWaitError("Waiting for H.264 target frame");
    }
    const requested = frames.filter(
      (frame) => frame.codec === "h264" && frame.h264?.hasFrame,
    );
    if (requested.length === 0) {
      throw new VideoTextureWaitError("Waiting for H.264 frame");
    }
    if (requested.length - 1 > MAX_H264_DECODE_RUNWAY_FRAMES) {
      throw new VideoTextureWaitError(
        "Waiting for a bounded H.264 keyframe runway",
      );
    }
    for (const frame of requested) this.rememberParameterSets(frame);
    if (this.dependencyGap && !requested[0].keyframe) {
      this.resetDecoder();
      throw new VideoTextureWaitError("Waiting for H.264 keyframe");
    }
    if (requested[0].keyframe) this.dependencyGap = false;

    let decodable = requested;
    let timestampsUs = decodable.map((frame) =>
      timestampMicros(frame.timestampNs),
    );
    if (
      this.lastTimestampUs !== undefined &&
      timestampsUs[0] <= this.lastTimestampUs
    ) {
      this.resetDecoder();
    }
    if (!this.decoder && !decodable[0].keyframe) {
      const replay = dependencyRunwayBefore(
        this.dependencyRunway,
        decodable[0].timestampNs,
      );
      if (replay.length === 0 || !replay[0].keyframe) {
        throw new VideoTextureWaitError("Waiting for H.264 keyframe");
      }
      if (
        replay.length + decodable.length - 1 >
        MAX_H264_DECODE_RUNWAY_FRAMES
      ) {
        throw new VideoTextureWaitError(
          "Waiting for a bounded H.264 keyframe runway",
        );
      }
      decodable = [...replay, ...decodable];
      timestampsUs = decodable.map((frame) =>
        timestampMicros(frame.timestampNs),
      );
    }

    const decoder = await this.ensureDecoder(decodable[0]);
    if (this.closed) throw new Error("Video decoder closed");

    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const timeoutError = new Error(
      "Timed out waiting for H.264 decode progress",
    );
    const armStallTimer = () => {
      if (stallTimer !== null) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stallTimer = null;
        this.resetDecoder(timeoutError);
      }, H264_DECODE_STALL_TIMEOUT_MS);
    };
    armStallTimer();

    let retainedOutput: VideoFrameLike | undefined;
    try {
      for (
        let start = 0;
        start < decodable.length;
        start += MAX_H264_DECODE_IN_FLIGHT_FRAMES
      ) {
        const end = Math.min(
          decodable.length,
          start + MAX_H264_DECODE_IN_FLIGHT_FRAMES,
        );
        const results = await Promise.allSettled(
          decodable.slice(start, end).map((frame, offset) => {
            const index = start + offset;
            return this.decodeFrame(
              decoder,
              frame,
              timestampsUs[index],
              index === decodable.length - 1,
              armStallTimer,
            );
          }),
        );
        let failure: unknown;
        for (const result of results) {
          if (result.status === "rejected") {
            failure ??= result.reason;
          } else if (result.value) {
            if (retainedOutput) closeVideoFrame(retainedOutput);
            retainedOutput = result.value;
          }
        }
        if (failure !== undefined) throw failure;
      }
    } catch (error) {
      if (retainedOutput) closeVideoFrame(retainedOutput);
      throw error;
    } finally {
      if (stallTimer !== null) clearTimeout(stallTimer);
    }

    if (!retainedOutput) {
      throw new Error("H.264 target frame produced no output");
    }
    this.lastTimestampUs = timestampsUs[timestampsUs.length - 1];
    this.rememberDependencyRunway(decodable);
    return retainedOutput;
  }

  private async ensureDecoder(
    frame: EncodedVideoVisualization,
  ): Promise<VideoDecoderLike> {
    if (!frame.keyframe && !this.decoder) {
      throw new VideoTextureWaitError("Waiting for H.264 keyframe");
    }

    const codecString = frame.h264?.codecString ?? this.codecString;
    if (!codecString) {
      throw new VideoTextureWaitError(
        "Waiting for H.264 keyframe with SPS/PPS",
      );
    }

    if (
      frame.keyframe &&
      this.decoder &&
      codecString !== this.configuredCodecString
    ) {
      this.resetDecoder();
    }
    if (this.decoder) return this.decoder;

    await this.slots.acquire(this);
    if (this.closed) throw new Error("Video decoder closed");
    if (this.decoder) return this.decoder;

    const Decoder = videoDecoderConstructor();
    if (!Decoder) throw new Error("WebCodecs video decoding is unavailable");
    if (globalThis.isSecureContext === false) {
      throw new Error("WebCodecs video decoding requires HTTPS");
    }

    const config: VideoDecoderConfigLike = {
      codec: codecString,
      hardwareAcceleration: "no-preference",
      optimizeForLatency: true,
    };
    const supported = await Decoder.isConfigSupported?.(config);
    if (this.closed) throw new Error("Video decoder closed");
    if (!supported?.supported) {
      throw new Error(`H.264 codec '${codecString}' is unsupported`);
    }
    if (this.decoder) return this.decoder;

    this.codecString = codecString;
    this.configuredCodecString = codecString;
    this.decoder = new Decoder({
      error: (error) => this.resetDecoder(toError(error)),
      output: (videoFrame) => {
        let pending: PendingVideoFrame | undefined;
        if (videoFrame.timestamp === undefined) {
          pending = this.pending.shift();
        } else {
          const timestampIndex = this.pending.findIndex(
            (entry) => entry.timestampUs === videoFrame.timestamp,
          );
          pending =
            timestampIndex >= 0
              ? this.pending.splice(timestampIndex, 1)[0]
              : undefined;
        }
        if (!pending) {
          closeVideoFrame(videoFrame);
          return;
        }

        pending.onProgress();
        if (pending.retain) {
          pending.resolve(videoFrame);
        } else {
          closeVideoFrame(videoFrame);
          pending.resolve(undefined);
        }
      },
    });
    this.decoder.configure(config);
    return this.decoder;
  }

  private decodeFrame(
    decoder: VideoDecoderLike,
    frame: EncodedVideoVisualization,
    timestampUs: number,
    retain: boolean,
    onProgress: () => void,
  ): Promise<VideoFrameLike | undefined> {
    const Chunk = encodedVideoChunkConstructor();
    if (!Chunk) {
      throw new Error("WebCodecs encoded video chunks are unavailable");
    }

    const data = h264AccessUnitWithParameterSets({
      bytes: frame.bytes,
      pps: frame.h264?.pps ? undefined : this.pps,
      sps: frame.h264?.sps ? undefined : this.sps,
    });
    const chunk = new Chunk({
      data,
      timestamp: timestampUs,
      type: frame.keyframe ? "key" : "delta",
    });

    return new Promise<VideoFrameLike | undefined>((resolve, reject) => {
      const pending: PendingVideoFrame = {
        onProgress,
        reject,
        retain,
        resolve,
        timestampUs,
      };
      this.pending.push(pending);

      try {
        decoder.decode(chunk);
      } catch (error) {
        this.pending = this.pending.filter((entry) => entry !== pending);
        const failure = toError(error);
        this.resetDecoder(failure);
        reject(failure);
      }
    });
  }

  private mergeCancelledPrerequisites(
    requestedFrames: readonly EncodedVideoVisualization[],
  ): readonly EncodedVideoVisualization[] {
    if (requestedFrames.some((frame) => frame.keyframe)) {
      this.cancelledPrerequisites = [];
      this.dependencyGap = false;
      return requestedFrames;
    }
    if (this.cancelledPrerequisites.length === 0) return requestedFrames;
    const merged = uniqueFramesByTimestamp([
      ...this.cancelledPrerequisites,
      ...requestedFrames,
    ]);
    this.cancelledPrerequisites = [];
    return merged;
  }

  private rememberCancelledPrerequisites(
    frames: readonly EncodedVideoVisualization[],
  ): void {
    const merged = uniqueFramesByTimestamp([
      ...this.cancelledPrerequisites,
      ...frames,
    ]);
    if (merged.some((frame) => frame.keyframe)) {
      let lastKeyframe = 0;
      for (let index = merged.length - 1; index >= 0; index -= 1) {
        if (!merged[index].keyframe) continue;
        lastKeyframe = index;
        break;
      }
      this.cancelledPrerequisites = merged.slice(lastKeyframe);
    } else {
      this.cancelledPrerequisites = merged;
    }
    if (this.cancelledPrerequisites.length > MAX_H264_DECODE_RUNWAY_FRAMES) {
      this.cancelledPrerequisites = [];
      this.dependencyGap = true;
    }
  }

  private rememberDependencyRunway(
    frames: readonly EncodedVideoVisualization[],
  ): void {
    for (const frame of frames) {
      if (frame.keyframe) {
        this.dependencyRunway = [frame];
      } else if (this.dependencyRunway.length > 0) {
        const previous = this.dependencyRunway.at(-1);
        if (previous?.timestampNs !== frame.timestampNs) {
          this.dependencyRunway.push(frame);
        }
      }
      if (this.dependencyRunway.length > MAX_H264_DECODE_RUNWAY_FRAMES) {
        // Every delta depends on its predecessor. Trimming old deltas while
        // retaining the keyframe would manufacture an invalid runway, so an
        // overlong GOP becomes non-replayable until the next real keyframe.
        this.dependencyRunway = [];
      }
    }
  }

  private rememberParameterSets(frame: EncodedVideoVisualization): void {
    if (frame.h264?.sps) this.sps = frame.h264.sps;
    if (frame.h264?.pps) this.pps = frame.h264.pps;
    if (frame.h264?.codecString) this.codecString = frame.h264.codecString;
  }

  private resetDecoder(error = new Error("Video decoder reset")): void {
    this.rejectPending(error);
    this.disposeDecoder();
  }

  private disposeDecoder(): void {
    try {
      this.decoder?.reset();
      this.decoder?.close();
    } catch {
      // Best effort cleanup; a later keyframe can build a fresh decoder.
    }
    this.decoder = null;
    this.configuredCodecString = undefined;
    this.lastTimestampUs = undefined;
  }

  private rejectPending(error: Error): void {
    const pending = this.pending.splice(0);
    for (const entry of pending) entry.reject(error);
  }

  private removeAbortListener(job: DecodeJob): void {
    if (job.signal && job.abortListener) {
      job.signal.removeEventListener("abort", job.abortListener);
      job.abortListener = undefined;
    }
  }
}

class VideoDecoderSlotScheduler {
  private readonly holders = new Set<H264VideoDecodeSession>();
  private readonly waiters: Array<{
    readonly reject: (error: Error) => void;
    readonly resolve: () => void;
    readonly session: H264VideoDecodeSession;
  }> = [];

  constructor(private readonly cap: number) {}

  get slotCount(): number {
    return this.holders.size;
  }

  get waitingCount(): number {
    return this.waiters.length;
  }

  acquire(session: H264VideoDecodeSession): Promise<void> {
    if (this.holders.has(session)) return Promise.resolve();
    this.parkOneIdleHolder();
    if (this.holders.size < this.cap) {
      this.holders.add(session);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ reject, resolve, session });
    });
  }

  release(session: H264VideoDecodeSession): void {
    this.holders.delete(session);
    for (let index = this.waiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.waiters[index];
      if (waiter.session !== session) continue;
      this.waiters.splice(index, 1);
      waiter.reject(new Error("Video decoder closed"));
    }
    this.grantWaiting();
  }

  sessionBecameIdle(session: H264VideoDecodeSession): void {
    if (this.waiters.length > 0 && this.holders.has(session)) {
      session.parkDecoder();
      this.holders.delete(session);
    }
    this.grantWaiting();
  }

  reset(): void {
    this.holders.clear();
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(new Error("Video decoder closed"));
    }
  }

  private parkOneIdleHolder(): void {
    if (this.holders.size < this.cap) return;
    for (const holder of this.holders) {
      if (!holder.canParkDecoder()) continue;
      holder.parkDecoder();
      this.holders.delete(holder);
      return;
    }
  }

  private grantWaiting(): void {
    while (this.waiters.length > 0) {
      this.parkOneIdleHolder();
      if (this.holders.size >= this.cap) return;
      const waiter = this.waiters.shift();
      if (!waiter) return;
      this.holders.add(waiter.session);
      waiter.resolve();
    }
  }
}

const sessions = new Map<string, RegisteredVideoSession>();
const decoderSlots = new VideoDecoderSlotScheduler(VIDEO_DECODE_SESSION_CAP);
let syntheticTimestampUs = 0;

function dependencyRunwayBefore(
  runway: readonly EncodedVideoVisualization[],
  timestampNs: bigint | undefined,
): readonly EncodedVideoVisualization[] {
  if (runway.length === 0) return [];
  if (timestampNs === undefined) return runway;
  return runway.filter(
    (frame) =>
      frame.timestampNs === undefined || frame.timestampNs < timestampNs,
  );
}

function uniqueFramesByTimestamp(
  frames: readonly EncodedVideoVisualization[],
): EncodedVideoVisualization[] {
  const result: EncodedVideoVisualization[] = [];
  const timestamps = new Set<bigint>();
  for (const frame of frames) {
    if (frame.timestampNs !== undefined) {
      if (timestamps.has(frame.timestampNs)) continue;
      timestamps.add(frame.timestampNs);
    }
    result.push(frame);
  }
  return result.sort((left, right) => {
    if (left.timestampNs === undefined || right.timestampNs === undefined) {
      return 0;
    }
    if (left.timestampNs < right.timestampNs) return -1;
    if (left.timestampNs > right.timestampNs) return 1;
    return 0;
  });
}

function textureFromVideoFrame(videoFrame: VideoFrameLike): ImageTextureHandle {
  const { height, width } = videoFrameSize(videoFrame);
  const texture = new THREE.Texture(videoFrame as TexImageSource);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return {
    aspectRatio: width / height,
    dispose: () => {
      texture.dispose();
      closeVideoFrame(videoFrame);
    },
    imageHeight: height,
    imageWidth: width,
    retainWhenUnused: false,
    texture,
  };
}

function canvasFromVideoFrame(videoFrame: VideoFrameLike): HTMLCanvasElement {
  const { height, width } = videoFrameSize(videoFrame);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Unable to create video preview canvas context");
  context.drawImage(
    videoFrame as unknown as CanvasImageSource,
    0,
    0,
    width,
    height,
  );
  return canvas;
}

function videoFrameSize(videoFrame: VideoFrameLike): {
  readonly height: number;
  readonly width: number;
} {
  return {
    height: Math.max(
      1,
      videoFrame.displayHeight ?? videoFrame.codedHeight ?? 1,
    ),
    width: Math.max(1, videoFrame.displayWidth ?? videoFrame.codedWidth ?? 1),
  };
}

function timestampMicros(timestampNs: bigint | undefined): number {
  if (timestampNs === undefined) {
    syntheticTimestampUs += 1;
    return syntheticTimestampUs;
  }
  return Number(timestampNs / NANOSECONDS_PER_MICROSECOND);
}

function videoDecoderConstructor(): VideoDecoderConstructor | undefined {
  return (
    globalThis as unknown as { readonly VideoDecoder?: VideoDecoderConstructor }
  ).VideoDecoder;
}

function encodedVideoChunkConstructor():
  | EncodedVideoChunkConstructor
  | undefined {
  return (
    globalThis as unknown as {
      readonly EncodedVideoChunk?: EncodedVideoChunkConstructor;
    }
  ).EncodedVideoChunk;
}

function closeVideoFrame(videoFrame: VideoFrameLike): void {
  videoFrame.close?.();
}
