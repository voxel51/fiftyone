import type { OwnedVideoPresentation, VideoPresentationLease } from "./types";

interface ClosableCanvasSource {
  readonly height: number;
  readonly width: number;
  close?: () => void;
}

/**
 * Copies a decoder-backed frame into a renderer-owned bitmap/canvas and closes
 * the decoder surface as soon as the copy completes.
 */
export async function copyVideoFramePresentation(
  frame: VideoFrame,
  timeNs: bigint,
): Promise<OwnedVideoPresentation> {
  const width = Math.max(1, frame.displayWidth || frame.codedWidth || 1);
  const height = Math.max(1, frame.displayHeight || frame.codedHeight || 1);
  let source: CanvasImageSource & ClosableCanvasSource;
  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(frame);
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to allocate an H.264 presentation canvas");
      }
      context.drawImage(frame, 0, 0, width, height);
      source = canvas;
    }
  } finally {
    frame.close();
  }
  return new SharedVideoPresentation(
    source,
    timeNs,
    Math.max(1, source.width || width),
    Math.max(1, source.height || height),
  );
}

/** One owner reference plus independent renderer leases. */
export class SharedVideoPresentation implements OwnedVideoPresentation {
  private disposed = false;
  private ownerReleased = false;
  private references = 1;

  constructor(
    private readonly source: CanvasImageSource & ClosableCanvasSource,
    readonly timeNs: bigint,
    readonly width: number,
    readonly height: number,
  ) {}

  get live(): boolean {
    return !this.disposed;
  }

  acquire(): VideoPresentationLease | null {
    if (this.disposed) return null;
    this.references += 1;
    let released = false;
    return {
      height: this.height,
      source: this.source,
      timeNs: this.timeNs,
      width: this.width,
      release: () => {
        if (released) return;
        released = true;
        this.releaseReference();
      },
    };
  }

  releaseOwner(): void {
    if (this.ownerReleased) return;
    this.ownerReleased = true;
    this.releaseReference();
  }

  private releaseReference(): void {
    if (this.disposed) return;
    this.references -= 1;
    if (this.references > 0) return;
    this.disposed = true;
    this.source.close?.();
  }
}
