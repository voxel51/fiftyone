/**
 * GPU-free encoded-image view: decodes bytes with `createImageBitmap` and
 * paints them onto a plain 2D `<canvas>`. Purpose-built for grid preview
 * cells, which must hold zero WebGPU devices at rest — the modal keeps
 * using the WebGPU-backed `ImagePanel`.
 *
 * Fit math intentionally matches `imageDisplayRect` in `base-2d-scene.tsx`
 * (the `ImagePanel` fit semantics) so swapping a cell between this view
 * and a live panel never shifts pixels. Bitmap lifecycle mirrors the
 * discipline in `image-texture-cache.ts`: a superseded decode never
 * commits, and every bitmap is closed exactly once (on replacement, on
 * cancellation, or on unmount).
 */
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef } from "react";

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The committed bitmap — stays drawn until the NEXT decode lands, so
  // frame advances and errors never flash an empty canvas (the behavior
  // ImagePanel gets from hasVisibleImageRef).
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onImageLoadedRef = useRef(onImageLoaded);
  onImageLoadedRef.current = onImageLoaded;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    if (!canvas || !bitmap) {
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

        bitmapRef.current?.close();
        bitmapRef.current = bitmap;
        draw();
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
  }, [bytes, mimeType, draw]);

  // This effect closes the committed bitmap on unmount (in-flight decodes
  // close their own bitmap via the cancellation guard above).
  useEffect(() => {
    return () => {
      bitmapRef.current?.close();
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

  // This effect redraws when `fit` changes without a new decode.
  useEffect(() => {
    draw();
  }, [draw, fit]);

  return (
    <canvas
      className={className}
      ref={canvasRef}
      role="img"
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
