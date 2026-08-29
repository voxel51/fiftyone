import { h264AccessUnitWithParameterSets } from "../codecs/h264-annexb";
import { toError } from "../utils/errors";
import type { EncodedVideoVisualization } from "../ir";
import { compareUnitDecodeTime } from "./gop-index";
import type { EncodedVideoAccessUnit, VideoDecoderActor } from "./types";
import {
  isSharedEncodedVideoVisualization,
  VideoDecoderFailureError,
  VideoDependencyWaitError,
  VideoIntentCancelledError,
} from "./types";

export const MAX_VIDEO_DECODE_IN_FLIGHT = 8;
const MAX_REORDERED_VIDEO_OUTPUTS = 32;
export const VIDEO_DECODE_PROGRESS_TIMEOUT_MS = 15_000;

interface PendingOutput {
  readonly reject: (error: Error) => void;
  readonly resolve: (frame: VideoFrame) => void;
  readonly timeNs: bigint;
  readonly submissionTimestampUs: number;
}

interface ReorderedOutput {
  frame: VideoFrame | null;
  readonly promise: Promise<VideoFrame>;
}

export interface WebCodecsDecoderEnvironment {
  readonly EncodedVideoChunk: typeof EncodedVideoChunk;
  readonly VideoDecoder: typeof VideoDecoder;
  readonly isSecureContext: boolean;
  readonly setTimeout: typeof globalThis.setTimeout;
  readonly clearTimeout: typeof globalThis.clearTimeout;
}

/** One serialized WebCodecs actor. It never flushes per frame. */
export class WebCodecsVideoDecoder implements VideoDecoderActor {
  private active = false;
  private closed = false;
  private codecString: string | null = null;
  private decoder: VideoDecoder | null = null;
  private readonly decoderQueueWaiters = new Set<(error: Error) => void>();
  private failed: Error | null = null;
  private lastOutputTimeNs: bigint | null = null;
  private lastSubmittedDecodeTimeNs: bigint | null = null;
  private lastSubmissionTimestampUs: number | null = null;
  private readonly pending: PendingOutput[] = [];
  private pps: Uint8Array | undefined;
  private readonly reorderedOutputs = new Map<bigint, ReorderedOutput>();
  private readonly reorderedSubmitted = new Set<bigint>();
  private sps: Uint8Array | undefined;

  constructor(private environmentValue?: WebCodecsDecoderEnvironment) {}

  private get environment(): WebCodecsDecoderEnvironment {
    this.environmentValue ??= browserWebCodecsEnvironment();
    return this.environmentValue;
  }

  get configuredCodec(): string | null {
    return this.codecString;
  }

  get cursorTimeNs(): bigint | null {
    return this.lastOutputTimeNs;
  }

  get cursorDecodeTimeNs(): bigint | null {
    return this.lastSubmittedDecodeTimeNs;
  }

  hasReadyPresentation(timeNs: bigint): boolean {
    return this.reorderedOutputs.get(timeNs)?.frame != null;
  }

  async decode(
    units: readonly EncodedVideoAccessUnit[],
    {
      signal,
      targetTimeNs,
    }: { readonly signal: AbortSignal; readonly targetTimeNs: bigint },
  ): Promise<VideoFrame> {
    if (this.closed) throw new Error("Video decoder closed");
    if (this.active) {
      throw new Error("Concurrent video decoder transaction");
    }
    if (signal.aborted) throw new VideoIntentCancelledError();
    const decodable = units.filter(isDecodableUnit).sort(compareUnitDecodeTime);
    if (decodable.length === 0) {
      throw new VideoDependencyWaitError("Waiting for a video access unit");
    }
    if (!this.decoder && !decodable[0].frame.keyframe) {
      throw new VideoDependencyWaitError("Waiting for a video keyframe");
    }

    this.active = true;
    let target: VideoFrame | undefined;
    try {
      if (
        decodable.some((unit) => unit.frame.decodeTimestampNs !== undefined)
      ) {
        return await this.decodeReordered(decodable, targetTimeNs, signal);
      }
      for (let start = 0; start < decodable.length; ) {
        if (signal.aborted) throw new VideoIntentCancelledError();
        const end = this.batchEnd(decodable, start);
        const batch = decodable.slice(start, end);
        start = end;
        const outputs = await this.decodeBatch(batch, targetTimeNs);
        for (const output of outputs) {
          if (!output) continue;
          target?.close();
          target = output;
        }
        if (signal.aborted) {
          target?.close();
          target = undefined;
          throw new VideoIntentCancelledError();
        }
        if (target) break;
      }
      if (!target) {
        throw new VideoDecoderFailureError(
          `${codecDisplayName(decodable[0].frame)} target produced no decoder output`,
        );
      }
      return target;
    } catch (error) {
      target?.close();
      throw error;
    } finally {
      this.active = false;
    }
  }

  /** Keeps a bounded, persistent submission window for MP4 decode-order samples. */
  private async decodeReordered(
    units: readonly EncodedVideoAccessUnit[],
    targetTimeNs: bigint,
    signal: AbortSignal,
  ): Promise<VideoFrame> {
    await this.ensureDecoder(units[0]);
    const decoder = this.decoder;
    if (!decoder) throw new Error("Video decoder closed");
    let timer: ReturnType<typeof setTimeout> | null = null;
    const armProgressTimer = () => {
      if (timer !== null) this.environment.clearTimeout(timer);
      timer = this.environment.setTimeout(() => {
        timer = null;
        this.failDecoder(
          new VideoDecoderFailureError(
            `Timed out waiting for ${codecDisplayName(units[0].frame)} decoder progress`,
          ),
        );
      }, VIDEO_DECODE_PROGRESS_TIMEOUT_MS);
    };

    try {
      armProgressTimer();
      this.discardReorderedOutputsBefore(targetTimeNs);
      for (const unit of units) {
        if (signal.aborted) throw new VideoIntentCancelledError();
        if (this.reorderedSubmitted.has(unit.timeNs)) continue;
        const decodeTimeNs = unit.frame.decodeTimestampNs ?? unit.timeNs;
        if (
          this.lastSubmittedDecodeTimeNs !== null &&
          decodeTimeNs <= this.lastSubmittedDecodeTimeNs
        ) {
          throw new VideoDecoderFailureError(
            `${codecDisplayName(unit.frame)} dependency arrived behind the decode-order cursor`,
          );
        }
        // A reordered decoder may consume queued chunks without emitting their
        // frames yet. Bound its input queue separately from the wider retained
        // output window so B-frame delay cannot deadlock submission.
        while (
          decoder.decodeQueueSize >= MAX_VIDEO_DECODE_IN_FLIGHT ||
          this.pending.length >= MAX_REORDERED_VIDEO_OUTPUTS
        ) {
          if (decoder.decodeQueueSize >= MAX_VIDEO_DECODE_IN_FLIGHT) {
            await this.waitForDecoderQueueProgress(
              decoder,
              MAX_VIDEO_DECODE_IN_FLIGHT,
              signal,
            );
          } else {
            await this.waitForReorderedProgress(signal);
          }
        }
        this.submitReordered(decoder, unit, armProgressTimer);
      }
      const target = this.reorderedOutputs.get(targetTimeNs);
      if (!target) {
        throw new VideoDecoderFailureError(
          `${codecDisplayName(units[0].frame)} target produced no decoder output`,
        );
      }
      const frame = await abortableDecoderOutput(target.promise, signal);
      if (signal.aborted) throw new VideoIntentCancelledError();
      this.reorderedOutputs.delete(targetTimeNs);
      target.frame = null;
      this.lastOutputTimeNs = targetTimeNs;
      this.discardSubmittedTimesBefore(targetTimeNs);
      return frame;
    } finally {
      if (timer !== null) this.environment.clearTimeout(timer);
    }
  }

  /** Never submit access units from two codec epochs to one decoder batch. */
  private batchEnd(
    units: readonly EncodedVideoAccessUnit[],
    start: number,
  ): number {
    const limit = Math.min(units.length, start + MAX_VIDEO_DECODE_IN_FLIGHT);
    const batchCodec =
      frameCodecString(units[start].frame) ?? this.codecString ?? undefined;
    for (let index = start + 1; index < limit; index += 1) {
      const unit = units[index];
      const codec = frameCodecString(unit.frame);
      if (unit.frame.keyframe && codec && batchCodec && codec !== batchCodec) {
        return index;
      }
    }
    return limit;
  }

  resetForDiscontinuity(): void {
    if (this.closed) return;
    this.failed = null;
    this.sps = undefined;
    this.pps = undefined;
    this.disposeDecoder(
      new VideoDecoderFailureError("Video decoder discontinuity"),
    );
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.disposeDecoder(new Error("Video decoder closed"), false);
    this.sps = undefined;
    this.pps = undefined;
  }

  private async decodeBatch(
    units: readonly EncodedVideoAccessUnit[],
    targetTimeNs: bigint,
  ): Promise<readonly (VideoFrame | undefined)[]> {
    const first = units[0];
    await this.ensureDecoder(first);
    const decoder = this.decoder;
    if (!decoder) throw new Error("Video decoder closed");

    let timer: ReturnType<typeof setTimeout> | null = null;
    const armProgressTimer = () => {
      if (timer !== null) this.environment.clearTimeout(timer);
      timer = this.environment.setTimeout(() => {
        timer = null;
        this.failDecoder(
          new VideoDecoderFailureError(
            `Timed out waiting for ${codecDisplayName(units[0].frame)} decoder progress`,
          ),
        );
      }, VIDEO_DECODE_PROGRESS_TIMEOUT_MS);
    };
    armProgressTimer();
    try {
      const promises = units.map((unit) =>
        this.submit(decoder, unit, armProgressTimer).then((frame) => {
          if (unit.timeNs === targetTimeNs) return frame;
          frame.close();
          return undefined;
        }),
      );
      const results = await Promise.allSettled(promises);
      const outputs = results.map((result) =>
        result.status === "fulfilled" ? result.value : undefined,
      );
      const rejection = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (this.failed || rejection) {
        for (const output of outputs) output?.close();
        throw this.failed ?? toError(rejection?.reason);
      }
      if (outputs.some(Boolean)) this.lastOutputTimeNs = targetTimeNs;
      return outputs;
    } finally {
      if (timer !== null) this.environment.clearTimeout(timer);
    }
  }

  private async ensureDecoder(unit: EncodedVideoAccessUnit): Promise<void> {
    if (this.failed) {
      const failure = this.failed;
      this.failed = null;
      throw failure;
    }
    const nextCodec = frameCodecString(unit.frame) ?? this.codecString;
    if (!nextCodec) {
      throw new VideoDependencyWaitError(
        `Waiting for a ${codecDisplayName(unit.frame)} keyframe with decoder configuration`,
      );
    }
    if (unit.frame.keyframe && this.decoder && this.codecString !== nextCodec) {
      this.disposeDecoder(
        new VideoDecoderFailureError("Video codec configuration changed"),
      );
    }
    if (this.decoder) return;
    if (!unit.frame.keyframe) {
      throw new VideoDependencyWaitError("Waiting for a video keyframe");
    }
    if (!this.environment.isSecureContext) {
      throw new VideoDecoderFailureError(
        "WebCodecs video decoding requires a secure context",
      );
    }
    const config: VideoDecoderConfig = {
      codec: nextCodec,
      hardwareAcceleration: "no-preference",
      optimizeForLatency: true,
    };
    const support =
      await this.environment.VideoDecoder.isConfigSupported(config);
    if (!support.supported) {
      throw new VideoDecoderFailureError(
        `${codecDisplayName(unit.frame)} codec '${nextCodec}' is unsupported`,
      );
    }
    if (this.closed) throw new Error("Video decoder closed");
    this.failed = null;
    this.codecString = nextCodec;
    this.decoder = new this.environment.VideoDecoder({
      error: (error) => this.failDecoder(toError(error)),
      output: (frame) => this.handleOutput(frame),
    });
    try {
      this.decoder.configure(config);
    } catch (error) {
      const failure = new VideoDecoderFailureError(
        `Failed to configure the ${codecDisplayName(unit.frame)} decoder`,
        { cause: error },
      );
      this.failDecoder(failure);
      throw failure;
    }
  }

  private submit(
    decoder: VideoDecoder,
    unit: EncodedVideoAccessUnit,
    onProgress: () => void,
  ): Promise<VideoFrame> {
    const data = this.chunkData(unit);
    // Preserve source PTS for browser-level observability. LeRobot MP4 units
    // carry an explicit DTS and may be submitted in non-monotonic PTS order
    // when B-frames are present. Units without DTS retain monotonic nudging.
    const sourceTimestampUs = Number(unit.timeNs / 1_000n);
    const submissionTimestampUs =
      unit.frame.decodeTimestampNs !== undefined
        ? uniquePendingTimestamp(sourceTimestampUs, this.pending)
        : this.lastSubmissionTimestampUs === null
          ? sourceTimestampUs
          : Math.max(sourceTimestampUs, this.lastSubmissionTimestampUs + 1);
    this.lastSubmissionTimestampUs = submissionTimestampUs;
    return new Promise<VideoFrame>((resolve, reject) => {
      const pending: PendingOutput = {
        reject,
        resolve: (frame) => {
          onProgress();
          resolve(frame);
        },
        timeNs: unit.timeNs,
        submissionTimestampUs,
      };
      this.pending.push(pending);
      try {
        decoder.decode(
          new this.environment.EncodedVideoChunk({
            data,
            timestamp: submissionTimestampUs,
            type: unit.frame.keyframe ? "key" : "delta",
          }),
        );
      } catch (error) {
        const index = this.pending.indexOf(pending);
        if (index >= 0) this.pending.splice(index, 1);
        const failure = new VideoDecoderFailureError(
          `Failed to submit a ${codecDisplayName(unit.frame)} access unit`,
          { cause: error },
        );
        this.failDecoder(failure);
        reject(failure);
      }
    });
  }

  private submitReordered(
    decoder: VideoDecoder,
    unit: EncodedVideoAccessUnit,
    onProgress: () => void,
  ): Promise<VideoFrame> {
    const existing = this.reorderedOutputs.get(unit.timeNs);
    if (existing) return existing.promise;
    const promise = this.submit(decoder, unit, onProgress);
    const output: ReorderedOutput = { frame: null, promise };
    this.reorderedOutputs.set(unit.timeNs, output);
    this.reorderedSubmitted.add(unit.timeNs);
    const decodeTimeNs = unit.frame.decodeTimestampNs ?? unit.timeNs;
    this.lastSubmittedDecodeTimeNs = decodeTimeNs;
    void promise.then(
      (frame) => {
        output.frame = frame;
        this.trimReorderedOutputs();
      },
      () => {
        if (this.reorderedOutputs.get(unit.timeNs) === output) {
          this.reorderedOutputs.delete(unit.timeNs);
          this.reorderedSubmitted.delete(unit.timeNs);
        }
      },
    );
    return promise;
  }

  private async waitForReorderedProgress(signal: AbortSignal): Promise<void> {
    const pending = [...this.reorderedOutputs.values()]
      .filter((output) => output.frame === null)
      .map((output) => output.promise);
    if (pending.length === 0) {
      throw new VideoDecoderFailureError(
        "Video decoder submission window made no progress",
      );
    }
    await abortableDecoderOutput(Promise.race(pending), signal);
  }

  private waitForDecoderQueueProgress(
    decoder: VideoDecoder,
    limit: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) return Promise.reject(new VideoIntentCancelledError());
    if (decoder.decodeQueueSize < limit) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.decoderQueueWaiters.delete(fail);
        decoder.removeEventListener("dequeue", onDequeue);
        signal.removeEventListener("abort", onAbort);
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onAbort = () => {
        cleanup();
        reject(new VideoIntentCancelledError());
      };
      const onDequeue = () => {
        if (decoder.decodeQueueSize >= limit) return;
        cleanup();
        resolve();
      };
      this.decoderQueueWaiters.add(fail);
      decoder.addEventListener("dequeue", onDequeue);
      signal.addEventListener("abort", onAbort, { once: true });
      // The queue can drain between the caller's check and listener install.
      if (signal.aborted) onAbort();
      else onDequeue();
    });
  }

  private discardReorderedOutputsBefore(timeNs: bigint): void {
    for (const [outputTimeNs, output] of this.reorderedOutputs) {
      if (outputTimeNs >= timeNs) continue;
      this.reorderedOutputs.delete(outputTimeNs);
      if (output.frame) output.frame.close();
      else
        void output.promise.then(
          (frame) => frame.close(),
          () => undefined,
        );
    }
  }

  private discardSubmittedTimesBefore(timeNs: bigint): void {
    for (const submittedTimeNs of this.reorderedSubmitted) {
      if (submittedTimeNs < timeNs) {
        this.reorderedSubmitted.delete(submittedTimeNs);
      }
    }
  }

  private trimReorderedOutputs(): void {
    if (this.reorderedOutputs.size <= MAX_REORDERED_VIDEO_OUTPUTS) return;
    for (const [timeNs, output] of this.reorderedOutputs) {
      if (!output.frame) continue;
      this.reorderedOutputs.delete(timeNs);
      this.reorderedSubmitted.delete(timeNs);
      output.frame.close();
      if (this.reorderedOutputs.size <= MAX_REORDERED_VIDEO_OUTPUTS) return;
    }
  }

  private handleOutput(frame: VideoFrame): void {
    const timestamp = frame.timestamp;
    const index = this.pending.findIndex(
      (pending) => pending.submissionTimestampUs === timestamp,
    );
    const pending = index >= 0 ? this.pending.splice(index, 1)[0] : undefined;
    if (!pending) {
      frame.close();
      return;
    }
    pending.resolve(frame);
  }

  private failDecoder(error: Error): void {
    const failure =
      error instanceof VideoDecoderFailureError
        ? error
        : new VideoDecoderFailureError("Video decoder failed", {
            cause: error,
          });
    this.failed = failure;
    this.disposeDecoder(failure);
  }

  private disposeDecoder(error: Error, reset = true): void {
    for (const fail of [...this.decoderQueueWaiters]) fail(error);
    for (const pending of this.pending.splice(0)) pending.reject(error);
    for (const output of this.reorderedOutputs.values()) {
      if (output.frame) output.frame.close();
      else
        void output.promise.then(
          (frame) => frame.close(),
          () => undefined,
        );
    }
    this.reorderedOutputs.clear();
    this.reorderedSubmitted.clear();
    const decoder = this.decoder;
    if (reset) {
      try {
        decoder?.reset();
      } catch {
        // The WebCodecs actor may already be closed after an error callback.
      }
    }
    try {
      decoder?.close();
    } catch {
      // The WebCodecs actor may already be closed after an error callback.
    }
    this.decoder = null;
    this.codecString = null;
    this.lastSubmittedDecodeTimeNs = null;
    this.lastOutputTimeNs = null;
    this.lastSubmissionTimestampUs = null;
  }

  private chunkData(unit: EncodedVideoAccessUnit): Uint8Array {
    if (unit.frame.codec !== "h264") return unit.frame.bytes;
    if (unit.frame.h264.sps) this.sps = unit.frame.h264.sps;
    if (unit.frame.h264.pps) this.pps = unit.frame.h264.pps;
    return h264AccessUnitWithParameterSets({
      bytes: unit.frame.bytes,
      pps: unit.frame.h264.pps ? undefined : this.pps,
      sps: unit.frame.h264.sps ? undefined : this.sps,
    });
  }
}

function uniquePendingTimestamp(
  preferred: number,
  pending: readonly PendingOutput[],
) {
  let timestamp = preferred;
  while (pending.some((entry) => entry.submissionTimestampUs === timestamp)) {
    timestamp += 1;
  }
  return timestamp;
}

function abortableDecoderOutput<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new VideoIntentCancelledError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new VideoIntentCancelledError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function browserWebCodecsEnvironment(): WebCodecsDecoderEnvironment {
  if (
    typeof VideoDecoder === "undefined" ||
    typeof EncodedVideoChunk === "undefined"
  ) {
    throw new VideoDecoderFailureError(
      "WebCodecs video decoding is unavailable",
    );
  }
  return {
    EncodedVideoChunk,
    VideoDecoder,
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    isSecureContext: globalThis.isSecureContext !== false,
    setTimeout: globalThis.setTimeout.bind(globalThis),
  };
}

function isDecodableUnit(unit: EncodedVideoAccessUnit): boolean {
  return isSharedEncodedVideoVisualization(unit.frame);
}

function frameCodecString(frame: EncodedVideoVisualization): string | null {
  if (frame.codec === "h264") return frame.h264.codecString ?? null;
  if (frame.codec === "av1") return frame.format;
  return null;
}

function codecDisplayName(frame: EncodedVideoVisualization): string {
  if (frame.codec === "h264") return "H.264";
  if (frame.codec === "av1") return "AV1";
  return frame.codec.toUpperCase();
}
