/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  FrameBitmapStream,
  type FrameBitmapStreamOptions,
} from "./frameBitmapStream";

export interface NativeVideoFrameStreamOptions extends FrameBitmapStreamOptions {
  /** Resolved media URL for the source video (e.g. `getSampleSrc(...)`). */
  videoSrc: string;
  /** Extra headers for the media fetch (auth); usually none for presigned. */
  headers?: Record<string, string>;
  /** Worker-side frame-exactness instrumentation (dev only). */
  debug?: boolean;
}

/**
 * Frame stream backed by on-demand WebCodecs decode of the source video (no
 * `to_frames` preprocessing). A `videoDecodeWorker` demuxes with mp4box and
 * decodes frames with a `VideoDecoder`, transferring `ImageBitmap`s back
 * zero-copy — the same shape {@link FrameBitmapStream} feeds the ImaVid tile,
 * so playback stays single-clock lock-step.
 *
 * All chunking / cache / readiness machinery is inherited; this subclass only
 * points the base at the WebCodecs source. GOP keyframe-snapping is handled
 * worker-side, so `buildChunkRequest` stays a plain frame range.
 */
export class NativeVideoFrameStream extends FrameBitmapStream<{
  timestamp: number;
}> {
  private readonly videoSrc: string;
  private readonly headers: Record<string, string>;
  private readonly debug: boolean;

  constructor(opts: NativeVideoFrameStreamOptions) {
    super(opts);
    this.videoSrc = opts.videoSrc;
    this.headers = opts.headers ?? {};
    this.debug = opts.debug ?? false;
  }

  protected createWorker(): Worker {
    return new Worker(new URL("./videoDecodeWorker.ts", import.meta.url), {
      type: "module",
    });
  }

  protected postInit(worker: Worker): void {
    worker.postMessage({
      type: "init",
      videoSrc: this.videoSrc,
      headers: this.headers,
      debug: this.debug,
    });
  }

  protected buildChunkRequest(
    startFrame: number,
    numFrames: number,
  ): { startFrame: number; numFrames: number } {
    // The worker owns keyframe snapping (decode from the GOP keyframe ≤ start),
    // so a plain presentation-frame range is all it needs.
    return { startFrame, numFrames };
  }
}
