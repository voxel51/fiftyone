/**
 * GPU-free bitmap views: paint `ImageBitmap`s onto a plain 2D `<canvas>`.
 * Purpose-built for grid preview cells, which must hold zero WebGPU
 * devices at rest — the modal keeps using the WebGPU-backed panels.
 *
 * Two entry points share one canvas lifecycle (`useBitmapCanvas`):
 *
 * - `BitmapImageView` decodes encoded image bytes with `createImageBitmap`
 *   and paints the result (image preview cells). Encoded video frames use
 *   WebCodecs for one-frame decode, then share the same canvas paint path.
 * - `BitmapCanvasHost` paints a ready `ImageBitmap` handed in as a prop
 *   (point-cloud preview cells at rest, fed by the shared snapshot
 *   renderer). The host OWNS every bitmap it is handed: it closes the
 *   replaced bitmap on swap and the committed one on unmount, so callers
 *   must not reuse a bitmap after passing a newer one.
 *
 * Fit math intentionally matches `imageDisplayRect` in `base-2d-scene.tsx`
 * (the `ImagePanel` fit semantics) so swapping a cell between this view
 * and a live panel never shifts pixels. Bitmap lifecycle mirrors the
 * discipline in `image-texture-cache.ts`: a superseded decode never
 * commits, and every bitmap is closed exactly once (on replacement, on
 * cancellation, or on unmount).
 */
import type { CSSProperties } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";

import type {
  EncodedVideoVisualization,
  ImageVisualization,
  RawImageVisualization,
} from "../../decoders";
import {
  createEncodedVideoCanvas,
  releaseEncodedVideoSession,
} from "./video-texture";

const DEFAULT_MIME_TYPE = "image/jpeg";

/**
 * CSS-pixel dimensions used by the draw-rect helper.
 */
export interface BitmapDrawSize {
  readonly height: number;
  readonly width: number;
}

/**
 * CSS-pixel destination rect for drawing a bitmap into a container.
 */
export interface BitmapDrawRect extends BitmapDrawSize {
  readonly x: number;
  readonly y: number;
}

/**
 * Props for rendering encoded image bytes without a GPU device.
 */
export interface BitmapImageViewProps {
  readonly bytes: Uint8Array;
  readonly className?: string;
  readonly fit?: "contain" | "cover";
  readonly mimeType?: string;
  /**
   * Reports a decode failure. The previously committed frame (if any)
   * stays visible — errors never blank the canvas.
   */
  readonly onError?: (error: unknown) => void;
  /**
   * Reports the DECODED image's natural dimensions after each committed
   * decode — the contract annotation overlays position themselves by.
   */
  readonly onImageLoaded?: (width: number, height: number) => void;
  readonly style?: CSSProperties;
}

/**
 * Props for painting a ready `ImageBitmap`. Ownership transfers to the
 * host (close-on-replace, close-on-unmount).
 */
export interface BitmapCanvasHostProps {
  readonly bitmap: ImageBitmap | null;
  readonly className?: string;
  readonly fit?: "contain" | "cover";
  readonly role?: string;
  readonly style?: CSSProperties;
}

/**
 * Props for rendering any image visualization without a GPU device.
 */
export interface BitmapImageFrameViewProps {
  readonly className?: string;
  readonly fit?: "contain" | "cover";
  readonly frame: ImageVisualization;
  /**
   * Reports a decode or canvas-paint failure. The previously committed frame
   * stays visible — errors never blank the canvas.
   */
  readonly onError?: (error: unknown) => void;
  readonly onImageLoaded?: (width: number, height: number) => void;
  readonly style?: CSSProperties;
}

type CanvasDrawable = (HTMLCanvasElement | ImageBitmap) & {
  readonly height: number;
  readonly width: number;
  close?: () => void;
};

/**
 * Destination rect for drawing an image of `image` size into `container`,
 * center-aligned. Identical math to `imageDisplayRect` in
 * `base-2d-scene.tsx` (the WebGPU `ImagePanel` path) — "cover" fills the
 * container and overflows the shorter axis symmetrically (the canvas
 * clips the overflow), "contain" letterboxes.
 */
export function bitmapDrawRect(
  container: BitmapDrawSize,
  image: BitmapDrawSize,
  fit: "contain" | "cover",
): BitmapDrawRect {
  const containerAspect = container.width / Math.max(1, container.height);
  const imageAspect = image.width / Math.max(1, image.height);
  const imageIsWider = imageAspect > containerAspect;
  const constrainByWidth = fit === "contain" ? imageIsWider : !imageIsWider;
  const width = constrainByWidth
    ? container.width
    : container.height * imageAspect;
  const height = constrainByWidth
    ? container.width / imageAspect
    : container.height;

  return {
    height,
    width,
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
  };
}

/**
 * Shared canvas lifecycle: owns the committed bitmap (close-on-replace,
 * close-on-unmount), sizes the backing store to CSS pixels, and redraws
 * on layout or fit changes.
 */
function useBitmapCanvas(fit: "contain" | "cover") {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The committed bitmap — stays drawn until the NEXT commit lands, so
  // frame advances and errors never flash an empty canvas (the behavior
  // ImagePanel gets from hasVisibleImageRef).
  const bitmapRef = useRef<CanvasDrawable | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    // A detached (closed) bitmap reports 0x0; drawing it would throw.
    // Skipping keeps the guard cheap and the canvas stable.
    if (!canvas || !bitmap || bitmap.width === 0 || bitmap.height === 0) {
      return;
    }

    // Backing store follows the canvas's CSS size at DPR 1 — deliberate
    // parity with WebGpuCanvas's DEFAULT_DPR = 1; raising preview DPR is
    // a follow-up decision, not a side effect of this path. Clamped ≥1×1
    // so a not-yet-laid-out cell never creates a zero-size canvas.
    const cssSize = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(cssSize.width));
    const height = Math.max(1, Math.round(cssSize.height));
    if (canvas.width !== width) {
      canvas.width = width;
    }
    if (canvas.height !== height) {
      canvas.height = height;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const rect = bitmapDrawRect(
      { height, width },
      { height: bitmap.height, width: bitmap.width },
      fitRef.current,
    );
    // Clear + draw in one synchronous block: no intermediate state is
    // ever presented, and "contain" letterbox bands from a previous
    // frame's aspect never linger.
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
  }, []);

  const commit = useCallback(
    (bitmap: CanvasDrawable | null) => {
      if (bitmapRef.current === bitmap) {
        if (bitmap) {
          draw();
        }
        return;
      }

      closeDrawable(bitmapRef.current);
      bitmapRef.current = bitmap;
      draw();
    },
    [draw],
  );

  // This effect closes the committed bitmap on unmount (in-flight
  // producers close their own bitmaps via their cancellation guards).
  useEffect(() => {
    return () => {
      closeDrawable(bitmapRef.current);
      bitmapRef.current = null;
    };
  }, []);

  // This effect redraws when the canvas's layout size changes, keeping
  // the backing store in sync with CSS pixels.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  // This effect redraws when `fit` changes without a new commit. The
  // first run is skipped: on mount either nothing is committed yet
  // (decode path) or the commit itself just drew (ready-bitmap path).
  const fitDrawnRef = useRef(false);
  useEffect(() => {
    if (!fitDrawnRef.current) {
      fitDrawnRef.current = true;
      return;
    }

    draw();
  }, [draw, fit]);

  return { canvasRef, commit };
}

function closeDrawable(drawable: CanvasDrawable | null): void {
  drawable?.close?.();
}

/**
 * Renders encoded image bytes to a container-filling 2D canvas. No WebGPU
 * device, no Three.js — decode, draw, done.
 */
export function BitmapImageView({
  bytes,
  className,
  fit = "cover",
  mimeType,
  onError,
  onImageLoaded,
  style,
}: BitmapImageViewProps) {
  const { canvasRef, commit } = useBitmapCanvas(fit);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onImageLoadedRef = useRef(onImageLoaded);
  onImageLoadedRef.current = onImageLoaded;

  // This effect decodes the current bytes and commits the resulting
  // bitmap. The cleanup flag is the out-of-order guard: only the latest
  // request may commit — a superseded decode (newer bytes arrived, or
  // unmount) closes its own bitmap and leaves the previous frame drawn.
  useEffect(() => {
    let cancelled = false;
    createImageBitmap(
      new Blob([bytes as BlobPart], { type: mimeType ?? DEFAULT_MIME_TYPE }),
    )
      .then((bitmap) => {
        if (cancelled) {
          bitmap.close();
          return;
        }

        commit(bitmap);
        onImageLoadedRef.current?.(bitmap.width, bitmap.height);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        // Keep the last good frame; only report.
        onErrorRef.current?.(error);
      });

    return () => {
      cancelled = true;
    };
  }, [bytes, mimeType, commit]);

  return (
    <canvas
      className={className}
      ref={canvasRef}
      role="img"
      style={{ ...styles.canvas, ...style }}
    />
  );
}

/**
 * Renders any decoded image visualization into the GPU-free bitmap canvas path.
 */
export function BitmapImageFrameView({
  className,
  fit = "cover",
  frame,
  onError,
  onImageLoaded,
  style,
}: BitmapImageFrameViewProps) {
  if (frame.kind === "encoded-video") {
    return (
      <BitmapEncodedVideoView
        className={className}
        frame={frame}
        fit={fit}
        onError={onError}
        onImageLoaded={onImageLoaded}
        style={style}
      />
    );
  }

  return frame.kind === "raw-image" ? (
    <BitmapRawImageView
      className={className}
      fit={fit}
      frame={frame}
      onError={onError}
      onImageLoaded={onImageLoaded}
      style={style}
    />
  ) : (
    <BitmapImageView
      bytes={frame.bytes}
      className={className}
      fit={fit}
      mimeType={frame.mimeType}
      onError={onError}
      onImageLoaded={onImageLoaded}
      style={style}
    />
  );
}

function BitmapEncodedVideoView({
  className,
  frame,
  fit = "cover",
  onError,
  onImageLoaded,
  style,
}: Omit<BitmapImageFrameViewProps, "frame"> & {
  readonly frame: EncodedVideoVisualization;
}) {
  const { canvasRef, commit } = useBitmapCanvas(fit);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onImageLoadedRef = useRef(onImageLoaded);
  onImageLoadedRef.current = onImageLoaded;
  const previewTextureKey = useId();

  useEffect(() => {
    let cancelled = false;

    createEncodedVideoCanvas(frame, previewTextureKey)
      .then((source) => {
        if (cancelled) {
          closeDrawable(source);
          return;
        }

        commit(source);
        onImageLoadedRef.current?.(source.width, source.height);
      })
      .catch((error) => {
        if (!cancelled) {
          onErrorRef.current?.(error);
        }
      });

    return () => {
      cancelled = true;
      releaseEncodedVideoSession(frame, previewTextureKey);
    };
  }, [commit, frame, previewTextureKey]);

  return (
    <canvas
      className={className}
      ref={canvasRef}
      role="img"
      style={{ ...styles.canvas, ...style }}
    />
  );
}

function BitmapRawImageView({
  className,
  fit = "cover",
  frame,
  onError,
  onImageLoaded,
  style,
}: Omit<BitmapImageFrameViewProps, "frame"> & {
  readonly frame: RawImageVisualization;
}) {
  const { canvasRef, commit } = useBitmapCanvas(fit);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onImageLoadedRef = useRef(onImageLoaded);
  onImageLoadedRef.current = onImageLoaded;
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    try {
      let source = sourceCanvasRef.current;
      if (!source) {
        source = document.createElement("canvas");
        sourceCanvasRef.current = source;
      }
      canvasFromRawImage(frame, source);
      commit(source);
      onImageLoadedRef.current?.(frame.width, frame.height);
    } catch (error) {
      onErrorRef.current?.(error);
    }
  }, [commit, frame]);

  return (
    <canvas
      className={className}
      ref={canvasRef}
      role="img"
      style={{ ...styles.canvas, ...style }}
    />
  );
}

function canvasFromRawImage(
  frame: RawImageVisualization,
  canvas: HTMLCanvasElement,
): void {
  if (frame.rgba.byteLength < frame.width * frame.height * 4) {
    throw new Error("Raw image frame has too few RGBA bytes");
  }

  if (canvas.width !== frame.width) {
    canvas.width = frame.width;
  }
  if (canvas.height !== frame.height) {
    canvas.height = frame.height;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create raw image canvas context");
  }

  const imageData = context.createImageData(frame.width, frame.height);
  imageData.data.set(frame.rgba.subarray(0, frame.width * frame.height * 4));
  context.putImageData(imageData, 0, 0);
}

/**
 * Renders a ready `ImageBitmap` to a container-filling 2D canvas and
 * takes ownership of it. Passing the same bitmap again is a no-op; a
 * `null` bitmap leaves the canvas untouched until a real one arrives, so
 * producers can keep the previous frame visible while the next renders.
 */
export function BitmapCanvasHost({
  bitmap,
  className,
  fit = "cover",
  role = "img",
  style,
}: BitmapCanvasHostProps) {
  const { canvasRef, commit } = useBitmapCanvas(fit);

  // This layout effect adopts the incoming bitmap before paint: the
  // replaced bitmap is closed exactly once and the swap draws in the same
  // commit, so a snapshot replacing another never flashes.
  useLayoutEffect(() => {
    commit(bitmap);
  }, [bitmap, commit]);

  return (
    <canvas
      className={className}
      ref={canvasRef}
      role={role}
      style={{ ...styles.canvas, ...style }}
    />
  );
}

const styles: Record<string, CSSProperties> = {
  canvas: {
    display: "block",
    height: "100%",
    width: "100%",
  },
};
