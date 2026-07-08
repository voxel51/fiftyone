import * as THREE from "three";

import type { EncodedVideoVisualization } from "../../decoders";
import { h264AccessUnitWithParameterSets } from "../../utils/h264-annexb";
import type { ImageTextureHandle } from "./base-2d-scene";

const VIDEO_DECODE_SESSION_CAP = 6;
const VIDEO_DECODE_TIMEOUT_MS = 3000;
const MICROSECONDS_PER_NANOSECOND = 1000n;

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
  close?: () => void;
}

interface VideoDecoderConfigLike {
  readonly avc?: {
    readonly format: "annexb";
  };
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
  readonly resolve: (frame: VideoFrameLike) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, H264VideoDecodeSession>();
let syntheticTimestampUs = 0;

export async function createEncodedVideoTexture(
  frame: EncodedVideoVisualization,
  textureKey: string | undefined,
): Promise<ImageTextureHandle> {
  if (frame.codec !== "h264") {
    throw new Error(`Video codec '${frame.codec}' is unsupported`);
  }

  const session = videoDecodeSessionForKey(videoSessionKey(textureKey, frame));
  return session.decode(frame);
}

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

export function resetVideoTextureDecodersForTests(): void {
  for (const session of sessions.values()) {
    session.close();
  }
  sessions.clear();
  syntheticTimestampUs = 0;
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
  private codecString: string | undefined;
  private configuredCodecString: string | undefined;
  private decoder: VideoDecoderLike | null = null;
  private lastTimestampUs: number | undefined;
  private pending: PendingVideoFrame[] = [];
  private pps: Uint8Array | undefined;
  private sps: Uint8Array | undefined;

  async decode(frame: EncodedVideoVisualization): Promise<ImageTextureHandle> {
    const output = await this.decodeVideoFrame(frame);
    return textureFromVideoFrame(output);
  }

  async decodeVideoFrame(
    frame: EncodedVideoVisualization,
  ): Promise<VideoFrameLike> {
    this.rememberParameterSets(frame);
    const timestampUs = timestampMicros(frame.timestampNs);

    if (
      this.lastTimestampUs !== undefined &&
      timestampUs <= this.lastTimestampUs
    ) {
      this.resetDecoder();
    }
    this.lastTimestampUs = timestampUs;

    if (!frame.h264?.hasFrame) {
      throw new Error("Waiting for H.264 frame");
    }

    const decoder = await this.ensureDecoder(frame);
    return this.decodeFrame(decoder, frame, timestampUs);
  }

  close(): void {
    this.rejectPending(new Error("Video decoder closed"));
    this.decoder?.close();
    this.decoder = null;
  }

  private async ensureDecoder(
    frame: EncodedVideoVisualization,
  ): Promise<VideoDecoderLike> {
    if (!frame.keyframe && !this.decoder) {
      throw new Error("Waiting for H.264 keyframe");
    }

    const codecString = frame.h264?.codecString ?? this.codecString;
    if (!codecString) {
      throw new Error("Waiting for H.264 keyframe with SPS/PPS");
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
    const Chunk = encodedVideoChunkConstructor();
    if (!Decoder || !Chunk) {
      throw new Error("WebCodecs video decoding is unavailable");
    }
    if (globalThis.isSecureContext === false) {
      throw new Error("WebCodecs video decoding requires HTTPS");
    }

    const config: VideoDecoderConfigLike = {
      avc: { format: "annexb" },
      codec: codecString,
      hardwareAcceleration: "no-preference",
      optimizeForLatency: true,
    };
    const supported = await Decoder.isConfigSupported?.(config);
    if (!supported?.supported) {
      throw new Error(`H.264 codec '${codecString}' is unsupported`);
    }

    this.codecString = codecString;
    this.configuredCodecString = codecString;
    this.decoder = new Decoder({
      error: (error) => {
        this.rejectPending(asError(error));
        this.resetDecoder();
      },
      output: (videoFrame) => {
        const pending = this.pending.shift();
        if (!pending) {
          closeVideoFrame(videoFrame);
          return;
        }

        clearTimeout(pending.timeout);
        pending.resolve(videoFrame);
      },
    });
    this.decoder.configure(config);
    return this.decoder;
  }

  private decodeFrame(
    decoder: VideoDecoderLike,
    frame: EncodedVideoVisualization,
    timestampUs: number,
  ): Promise<VideoFrameLike> {
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

    return new Promise<VideoFrameLike>((resolve, reject) => {
      const pending: PendingVideoFrame = {
        reject,
        resolve,
        timeout: setTimeout(() => {
          this.pending = this.pending.filter((entry) => entry !== pending);
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

  return Number(timestampNs / MICROSECONDS_PER_NANOSECOND);
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
