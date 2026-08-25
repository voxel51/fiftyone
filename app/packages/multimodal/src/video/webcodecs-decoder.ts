import { h264AccessUnitWithParameterSets } from "../codecs/h264-annexb";
import { toError } from "../utils/errors";
import type { H264AccessUnit, VideoDecoderActor } from "./types";
import {
  VideoDecoderFailureError,
  VideoDependencyWaitError,
  VideoIntentCancelledError,
} from "./types";

export const MAX_VIDEO_DECODE_IN_FLIGHT = 8;
export const VIDEO_DECODE_PROGRESS_TIMEOUT_MS = 15_000;

interface PendingOutput {
  readonly reject: (error: Error) => void;
  readonly resolve: (frame: VideoFrame | undefined) => void;
  readonly retain: boolean;
  readonly timeNs: bigint;
  readonly submissionTimestampUs: number;
}

export interface WebCodecsDecoderEnvironment {
  readonly EncodedVideoChunk: typeof EncodedVideoChunk;
  readonly VideoDecoder: typeof VideoDecoder;
  readonly isSecureContext: boolean;
  readonly setTimeout: typeof globalThis.setTimeout;
  readonly clearTimeout: typeof globalThis.clearTimeout;
}

/** One serialized WebCodecs actor. It never flushes per frame. */
export class WebCodecsH264Decoder implements VideoDecoderActor {
  private active = false;
  private closed = false;
  private codecString: string | null = null;
  private decoder: VideoDecoder | null = null;
  private failed: Error | null = null;
  private lastOutputTimeNs: bigint | null = null;
  private lastSubmissionTimestampUs: number | null = null;
  private readonly pending: PendingOutput[] = [];
  private pps: Uint8Array | undefined;
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

  async decode(
    units: readonly H264AccessUnit[],
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
    const decodable = units
      .filter((unit) => unit.frame.h264.hasFrame !== false)
      .sort(compareDecodeOrder);
    if (decodable.length === 0) {
      throw new VideoDependencyWaitError("Waiting for an H.264 access unit");
    }
    if (!this.decoder && !decodable[0].frame.keyframe) {
      throw new VideoDependencyWaitError("Waiting for an H.264 keyframe");
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
          "H.264 target produced no decoder output",
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

  /**
   * Keeps a bounded sliding submission window for MP4 decode-order samples.
   * B-frame decoders may retain a few inputs until later references arrive,
   * so waiting for every fixed batch would deadlock before those references
   * can be submitted. One flush at the transaction boundary drains the tail.
   */
  private async decodeReordered(
    units: readonly H264AccessUnit[],
    targetTimeNs: bigint,
    signal: AbortSignal,
  ): Promise<VideoFrame> {
    await this.ensureDecoder(units[0]);
    const decoder = this.decoder;
    if (!decoder) throw new Error("Video decoder closed");
    const inFlight = new Set<Promise<VideoFrame | undefined>>();
    let target: VideoFrame | undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const armProgressTimer = () => {
      if (timer !== null) this.environment.clearTimeout(timer);
      timer = this.environment.setTimeout(() => {
        timer = null;
        this.failDecoder(
          new VideoDecoderFailureError(
            "Timed out waiting for H.264 decoder progress",
          ),
        );
      }, VIDEO_DECODE_PROGRESS_TIMEOUT_MS);
    };
    const waitForOne = async () => {
      const settled = await Promise.race(
        [...inFlight].map(async (promise) => ({
          output: await promise,
          promise,
        })),
      );
      inFlight.delete(settled.promise);
      if (settled.output) {
        target?.close();
        target = settled.output;
      }
    };

    try {
      armProgressTimer();
      for (const unit of units) {
        if (signal.aborted) throw new VideoIntentCancelledError();
        while (inFlight.size >= MAX_VIDEO_DECODE_IN_FLIGHT) {
          await waitForOne();
        }
        inFlight.add(
          this.submit(
            decoder,
            unit,
            unit.timeNs === targetTimeNs,
            armProgressTimer,
          ),
        );
      }
      await decoder.flush();
      while (inFlight.size) await waitForOne();
      if (signal.aborted) throw new VideoIntentCancelledError();
      if (!target) {
        throw new VideoDecoderFailureError(
          "H.264 target produced no decoder output",
        );
      }
      return target;
    } catch (error) {
      target?.close();
      await Promise.allSettled(inFlight);
      throw error;
    } finally {
      if (timer !== null) this.environment.clearTimeout(timer);
    }
  }

  /** Never submit access units from two codec epochs to one decoder batch. */
  private batchEnd(units: readonly H264AccessUnit[], start: number): number {
    const limit = Math.min(units.length, start + MAX_VIDEO_DECODE_IN_FLIGHT);
    const batchCodec =
      units[start].frame.h264.codecString ?? this.codecString ?? undefined;
    for (let index = start + 1; index < limit; index += 1) {
      const unit = units[index];
      const codec = unit.frame.h264.codecString;
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
      new VideoDecoderFailureError("H.264 decoder discontinuity"),
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
    units: readonly H264AccessUnit[],
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
            "Timed out waiting for H.264 decoder progress",
          ),
        );
      }, VIDEO_DECODE_PROGRESS_TIMEOUT_MS);
    };
    armProgressTimer();
    try {
      const promises = units.map((unit) =>
        this.submit(
          decoder,
          unit,
          unit.timeNs === targetTimeNs,
          armProgressTimer,
        ),
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
      return outputs;
    } finally {
      if (timer !== null) this.environment.clearTimeout(timer);
    }
  }

  private async ensureDecoder(unit: H264AccessUnit): Promise<void> {
    if (this.failed) {
      const failure = this.failed;
      this.failed = null;
      throw failure;
    }
    const nextCodec = unit.frame.h264.codecString ?? this.codecString;
    if (!nextCodec) {
      throw new VideoDependencyWaitError(
        "Waiting for an H.264 keyframe with SPS/PPS",
      );
    }
    if (unit.frame.keyframe && this.decoder && this.codecString !== nextCodec) {
      this.disposeDecoder(
        new VideoDecoderFailureError("H.264 codec configuration changed"),
      );
    }
    if (this.decoder) return;
    if (!unit.frame.keyframe) {
      throw new VideoDependencyWaitError("Waiting for an H.264 keyframe");
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
        `H.264 codec '${nextCodec}' is unsupported`,
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
        "Failed to configure the H.264 decoder",
        { cause: error },
      );
      this.failDecoder(failure);
      throw failure;
    }
  }

  private submit(
    decoder: VideoDecoder,
    unit: H264AccessUnit,
    retain: boolean,
    onProgress: () => void,
  ): Promise<VideoFrame | undefined> {
    if (unit.frame.h264.sps) this.sps = unit.frame.h264.sps;
    if (unit.frame.h264.pps) this.pps = unit.frame.h264.pps;
    const data = h264AccessUnitWithParameterSets({
      bytes: unit.frame.bytes,
      pps: unit.frame.h264.pps ? undefined : this.pps,
      sps: unit.frame.h264.sps ? undefined : this.sps,
    });
    // Preserve source PTS for browser-level observability. LeRobot MP4 units
    // carry an explicit DTS and may be submitted in non-monotonic PTS order
    // when B-frames are present. Legacy streams retain monotonic nudging.
    const sourceTimestampUs = Number(unit.timeNs / 1_000n);
    const submissionTimestampUs =
      unit.frame.decodeTimestampNs !== undefined
        ? uniquePendingTimestamp(sourceTimestampUs, this.pending)
        : this.lastSubmissionTimestampUs === null
          ? sourceTimestampUs
          : Math.max(sourceTimestampUs, this.lastSubmissionTimestampUs + 1);
    this.lastSubmissionTimestampUs = submissionTimestampUs;
    return new Promise<VideoFrame | undefined>((resolve, reject) => {
      const pending: PendingOutput = {
        reject,
        resolve: (frame) => {
          onProgress();
          resolve(frame);
        },
        retain,
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
          "Failed to submit an H.264 access unit",
          { cause: error },
        );
        this.failDecoder(failure);
        reject(failure);
      }
    });
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
    if (
      this.lastOutputTimeNs === null ||
      pending.timeNs > this.lastOutputTimeNs
    ) {
      this.lastOutputTimeNs = pending.timeNs;
    }
    if (pending.retain) {
      pending.resolve(frame);
    } else {
      frame.close();
      pending.resolve(undefined);
    }
  }

  private failDecoder(error: Error): void {
    const failure =
      error instanceof VideoDecoderFailureError
        ? error
        : new VideoDecoderFailureError("H.264 decoder failed", {
            cause: error,
          });
    this.failed = failure;
    this.disposeDecoder(failure);
  }

  private disposeDecoder(error: Error, reset = true): void {
    for (const pending of this.pending.splice(0)) pending.reject(error);
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
    this.lastOutputTimeNs = null;
    this.lastSubmissionTimestampUs = null;
  }
}

function compareDecodeOrder(left: H264AccessUnit, right: H264AccessUnit) {
  const leftTime = left.frame.decodeTimestampNs ?? left.timeNs;
  const rightTime = right.frame.decodeTimestampNs ?? right.timeNs;
  return leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0;
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

function browserWebCodecsEnvironment(): WebCodecsDecoderEnvironment {
  if (
    typeof VideoDecoder === "undefined" ||
    typeof EncodedVideoChunk === "undefined"
  ) {
    throw new VideoDecoderFailureError(
      "WebCodecs H.264 decoding is unavailable",
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
