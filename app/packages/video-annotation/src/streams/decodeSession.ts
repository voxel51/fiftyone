/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/// <reference types="dom-webcodecs" />

/**
 * A `VideoDecoder` kept open across contiguous chunk decodes.
 *
 * WebCodecs needs a keyframe after every `configure()` and every `flush()`, so
 * a stream whose real keyframes are far apart pays a long lead-in decode for
 * every chunk that restarts the decoder. When the next chunk's samples begin
 * within or right after the run fed since the last restart, the session
 * continues instead and only the samples not yet fed are decoded. With
 * B-frames that overlap is the usual case: the picture a chunk presents first
 * is often a reference the previous chunk already fed, decoded ahead of the
 * B-frames presented before it.
 *
 * A decoder holds a pipeline of finished frames and emits them as later input
 * arrives, so the tail of a chunk generally leaves with the NEXT chunk's
 * samples. Waiting for it at a chunk boundary would stall playback for as long
 * as the pipeline is deep; the caller instead attributes frames as they arrive
 * and calls {@link flush} only when no more input is coming.
 */
export class DecodeSession {
  private decoder: VideoDecoder;
  /**
   * Decode indices `[start, end]` fed since the last restart, contiguous;
   * `null` when continuity is broken.
   */
  private start: number | null = null;
  private end: number | null = null;

  constructor(
    private readonly output: (frame: VideoFrame) => void,
    /** Called when the decoder fails; frames already fed will not arrive. */
    private readonly onError: (error: Error) => void,
  ) {
    this.decoder = this.createDecoder();
  }

  /** Decode index of the last sample fed; `null` when continuity is broken. */
  get fedThrough(): number | null {
    return this.end;
  }

  /** Whether a span starting at decode index `dStart` can continue this session. */
  canContinue(dStart: number): boolean {
    return (
      this.start !== null &&
      this.end !== null &&
      dStart >= this.start &&
      dStart <= this.end + 1
    );
  }

  /** Begin a fresh session; the next chunk fed must be a keyframe. */
  restart(config: VideoDecoderConfig): void {
    if (this.decoder.state === "closed") {
      this.decoder = this.createDecoder();
    }

    this.decoder.configure(config);
    this.reset();
  }

  /** Feed the sample at `decodeIndex`, the one after the last fed. */
  decode(chunk: EncodedVideoChunk, decodeIndex: number): void {
    this.decoder.decode(chunk);
    this.start ??= decodeIndex;
    this.end = decodeIndex;
  }

  /**
   * Force out every frame the decoder is still holding. Continuity ends here:
   * WebCodecs requires a keyframe after a flush, so the next chunk snaps back.
   */
  async flush(): Promise<void> {
    this.reset();

    if (this.decoder.state !== "configured") {
      return;
    }

    await this.decoder.flush();
  }

  private createDecoder(): VideoDecoder {
    return new VideoDecoder({
      output: this.output,
      error: (error) => {
        this.reset();
        this.onError(error as Error);
      },
    });
  }

  private reset(): void {
    this.start = null;
    this.end = null;
  }
}
