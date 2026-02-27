import { createConcurrencyLimiter, type ConcurrencyLimiter } from "./utils";

const DEFAULT_SIZE = 72;
const DEFAULT_QUALITY = 0.7;
const DEFAULT_THUMB_CONCURRENCY = 4;

let sharedLimiter: ConcurrencyLimiter | null = null;

function getThumbnailLimiter(): ConcurrencyLimiter {
  if (!sharedLimiter) {
    sharedLimiter = createConcurrencyLimiter(DEFAULT_THUMB_CONCURRENCY);
  }
  return sharedLimiter;
}

export interface ThumbnailOptions {
  /** Maximum width/height in pixels (default 72 — 2x a 36px display for retina). */
  size?: number;
  /** JPEG quality 0–1 (default 0.7). */
  quality?: number;
}

/**
 * Returns true if `file.type` starts with `"image/"`.
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Returns true if `file.type` starts with `"video/"`.
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

/**
 * Computes the scaled dimensions that fit within `maxSize` while preserving
 * the original aspect ratio.  Never scales up.
 */
export function scaledDimensions(
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } {
  const scale = Math.min(maxSize / width, maxSize / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Downscales a `File` to a tiny JPEG data-URL using an offscreen canvas.
 *
 * The full-size object URL is released as soon as the thumbnail is drawn.
 * Supports cancellation via an `AbortSignal`.
 *
 * @returns a `data:image/jpeg;base64,...` string
 */
export function createThumbnail(
  file: File,
  signal: AbortSignal,
  options: ThumbnailOptions = {}
): Promise<string> {
  const size = options.size ?? DEFAULT_SIZE;
  const quality = options.quality ?? DEFAULT_QUALITY;

  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(blobUrl);
      img.onload = null;
      img.onerror = null;
    };

    signal.addEventListener(
      "abort",
      () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );

    img.onload = () => {
      const { width, height } = scaledDimensions(img.width, img.height, size);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      cleanup();
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    img.onerror = () => {
      cleanup();
      reject(new Error("Failed to load image for thumbnail"));
    };

    img.src = blobUrl;
  });
}

/**
 * Like {@link createThumbnail}, but queued through a shared concurrency
 * limiter so that at most a few thumbnails are generated simultaneously.
 * This prevents the browser from stalling when hundreds of images are
 * added at once.
 */
export function queueThumbnail(
  file: File,
  signal: AbortSignal,
  options: ThumbnailOptions = {}
): Promise<string> {
  const limiter = getThumbnailLimiter();
  return limiter(() => {
    if (signal.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }
    return createThumbnail(file, signal, options);
  });
}
