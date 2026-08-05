import * as THREE from "three";

import type { EncodedVideoVisualization } from "../../ir";
import { h264AccessUnitWithParameterSets } from "../../codecs/h264-annexb";
import type { ImageTextureHandle } from "./Base2dScene";

const VIDEO_DECODE_SESSION_CAP = 6;
const VIDEO_DECODE_TIMEOUT_MS = 3000;
const NANOSECONDS_PER_MICROSECOND = 1000n;

/** Expected decoder state that can resolve once more stream data arrives. */
export class VideoTextureWaitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoTextureWaitError";
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
  readonly reject: (error: Error) => void;
  readonly resolve: (frame: VideoFrameLike | undefined) => void;
  readonly retain: boolean;
  readonly timestampUs: number;
  readonly timeout: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, H264VideoDecodeSession>();
let syntheticTimestampUs = 0;

/**
 * Decodes an encoded video visualization into a disposable Three texture.
 */
export async function createEncodedVideoTexture(
  frame: EncodedVideoVisualization,
  textureKey: string | undefined,
  decodeRunway: readonly EncodedVideoVisualization[] = [],
): Promise<ImageTextureHandle> {
  if (frame.codec !== "h264") {
    throw new Error(`Video codec '${frame.codec}' is unsupported`);
  }

  const session = videoDecodeSessionForKey(videoSessionKey(textureKey, frame));
  return session.decode(frame, decodeRunway);
}

/**
 * Decodes an encoded video visualization into a canvas for GPU-free previews.
 */
export async function createEncodedVideoCanvas(
  frame: EncodedVideoVisualization,
  textureKey: string | undefined,
): Promise<HTMLCanvasElement> {
  if (frame.codec !== "h264") {
    throw new Error(`Video codec '${frame.codec}' is unsupported`);
  }

  const session = videoDecodeSessionForKey(videoSessionKey(textureKey, frame));
  const output = await session.decodeVideoFrame(frame);
  try {
    return canvasFromVideoFrame(output);
  } finally {
    closeVideoFrame(output);
  }
}

/**
 * Clears shared WebCodecs sessions and synthetic timestamps between tests.
 */
export function resetVideoTextureDecodersForTests(): void {
  for (const session of sessions.values()) {
    session.close();
  }
  sessions.clear();
  syntheticTimestampUs = 0;
}

export function releaseEncodedVideoSession(
  frame: EncodedVideoVisualization,
  textureKey: string | undefined,
): void {
  const sessionKey = videoSessionKey(textureKey, frame);
  const session = sessions.get(sessionKey);
  if (!session) {
    return;
  }

  session.close();
  sessions.delete(sessionKey);
}

function videoDecodeSessionForKey(sessionKey: string): H264VideoDecodeSession {
  const existing = sessions.get(sessionKey);
  if (existing) {
    sessions.delete(sessionKey);
    sessions.set(sessionKey, existing);
    return existing;
  }

  const session = new H264VideoDecodeSession();
  sessions.set(sessionKey, session);
  while (sessions.size > VIDEO_DECODE_SESSION_CAP) {
    const oldestKey = sessions.keys().next().value as string;
    sessions.get(oldestKey)?.close();
    sessions.delete(oldestKey);
  }

  return session;
}

function videoSessionKey(
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
  private closed = false;
  private codecString: string | undefined;
  private configuredCodecString: string | undefined;
  private decoder: VideoDecoderLike | null = null;
  private lastTimestampUs: number | undefined;
  private pending: PendingVideoFrame[] = [];
  private pps: Uint8Array | undefined;
  private sps: Uint8Array | undefined;
  private jobTail: Promise<void> = Promise.resolve();

  async decode(
    frame: EncodedVideoVisualization,
    decodeRunway: readonly EncodedVideoVisualization[],
  ): Promise<ImageTextureHandle> {
    const output = await this.enqueue(() =>
      this.decodeVideoFrameBatch([...decodeRunway, frame]),
    );
    return textureFromVideoFrame(output);
  }

  async decodeVideoFrame(
    frame: EncodedVideoVisualization,
  ): Promise<VideoFrameLike> {
    return this.enqueue(() => this.decodeVideoFrameBatch([frame]));
  }

  private async decodeVideoFrameBatch(
    frames: readonly EncodedVideoVisualization[],
  ): Promise<VideoFrameLike> {
    const target = frames.at(-1);
    if (target?.codec !== "h264" || !target.h264?.hasFrame) {
      throw new VideoTextureWaitError("Waiting for H.264 target frame");
    }
    const decodable = frames.filter(
      (frame) => frame.codec === "h264" && frame.h264?.hasFrame,
    );
    if (decodable.length === 0) {
      throw new VideoTextureWaitError("Waiting for H.264 frame");
    }
    for (const frame of decodable) {
      this.rememberParameterSets(frame);
    }
    const timestampsUs = decodable.map((frame) =>
      timestampMicros(frame.timestampNs),
    );

    if (
      this.lastTimestampUs !== undefined &&
      timestampsUs[0] <= this.lastTimestampUs
    ) {
      this.resetDecoder();
    }
    this.lastTimestampUs = timestampsUs[timestampsUs.length - 1];

    const decoder = await this.ensureDecoder(decodable[0]);
    if (this.closed) {
      throw new Error("Video decoder closed");
    }
    const results = await Promise.allSettled(
      decodable.map((frame, index) =>
        this.decodeFrame(
          decoder,
          frame,
          timestampsUs[index],
          index === decodable.length - 1,
        ),
      ),
    );
    const outputs: Array<VideoFrameLike | undefined> = [];
    let failure: unknown;
    for (const result of results) {
      if (result.status === "rejected") {
        failure ??= result.reason;
      } else {
        outputs.push(result.value);
      }
    }
    if (failure !== undefined) {
      for (const output of outputs) {
        if (output) closeVideoFrame(output);
      }
      throw failure;
    }
    const output = outputs.at(-1);
    if (!output) {
      throw new Error("H.264 target frame produced no output");
    }
    return output;
  }

  close(): void {
    this.closed = true;
    this.rejectPending(new Error("Video decoder closed"));
    this.decoder?.close();
    this.decoder = null;
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

    if (this.decoder) {
      return this.decoder;
    }

    const Decoder = videoDecoderConstructor();
    if (!Decoder) {
      throw new Error("WebCodecs video decoding is unavailable");
    }
    if (globalThis.isSecureContext === false) {
      throw new Error("WebCodecs video decoding requires HTTPS");
    }

    const config: VideoDecoderConfigLike = {
      codec: codecString,
      hardwareAcceleration: "no-preference",
      optimizeForLatency: true,
    };
    const supported = await Decoder.isConfigSupported?.(config);
    if (this.closed) {
      throw new Error("Video decoder closed");
    }
    if (!supported?.supported) {
      throw new Error(`H.264 codec '${codecString}' is unsupported`);
    }

    if (this.decoder) {
      return this.decoder;
    }

    this.codecString = codecString;
    this.configuredCodecString = codecString;
    this.decoder = new Decoder({
      error: (error) => {
        this.rejectPending(asError(error));
        this.resetDecoder();
      },
      output: (videoFrame) => {
        const timestampIndex =
          videoFrame.timestamp === undefined
            ? -1
            : this.pending.findIndex(
                (entry) => entry.timestampUs === videoFrame.timestamp,
              );
        const pending =
          timestampIndex >= 0
            ? this.pending.splice(timestampIndex, 1)[0]
            : this.pending.shift();
        if (!pending) {
          closeVideoFrame(videoFrame);
          return;
        }

        clearTimeout(pending.timeout);
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
        reject,
        retain,
        resolve,
        timestampUs,
        timeout: setTimeout(() => {
          this.pending = this.pending.filter((entry) => entry !== pending);
          this.resetDecoder();
          reject(new Error("Timed out waiting for H.264 frame decode"));
        }, VIDEO_DECODE_TIMEOUT_MS),
      };
      this.pending.push(pending);

      try {
        decoder.decode(chunk);
      } catch (error) {
        clearTimeout(pending.timeout);
        this.pending = this.pending.filter((entry) => entry !== pending);
        this.resetDecoder();
        reject(asError(error));
      }
    });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.jobTail.then(() => {
      if (this.closed) {
        throw new Error("Video decoder closed");
      }
      return job();
    });
    this.jobTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private rememberParameterSets(frame: EncodedVideoVisualization): void {
    if (frame.h264?.sps) {
      this.sps = frame.h264.sps;
    }
    if (frame.h264?.pps) {
      this.pps = frame.h264.pps;
    }
    if (frame.h264?.codecString) {
      this.codecString = frame.h264.codecString;
    }
  }

  private resetDecoder(): void {
    this.rejectPending(new Error("Video decoder reset"));
    try {
      this.decoder?.reset();
      this.decoder?.close();
    } catch {
      // Best effort cleanup; the next frame will build a fresh session.
    }
    this.decoder = null;
    this.configuredCodecString = undefined;
  }

  private rejectPending(error: Error): void {
    const pending = this.pending.splice(0);
    for (const entry of pending) {
      clearTimeout(entry.timeout);
      entry.reject(error);
    }
  }
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
  if (!context) {
    throw new Error("Unable to create video preview canvas context");
  }

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

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
