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
 * Fit math intentionally matches `imageDisplayRect` in `Base2dScene.tsx`
 * (the `ImagePanel` fit semantics) so swapping a cell between this view
 * and a live panel never shifts pixels. Bitmap lifecycle mirrors the
 * discipline in `image-texture-cache.ts`: a superseded decode never
 * commits, and every bitmap is closed exactly once (on replacement, on
 * cancellation, or on unmount).
 */
import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  type CameraVisualization,
  type EncodedVideoVisualization,
  type RawImageVisualization,
} from "../../ir";
import { VideoPlaybackManager } from "../../video/playback-manager";
import { PushVideoAccessUnitReader } from "../../video/push-reader";
import {
  useOptionalVideoPlaybackManager,
  useVideoStreamPresentation,
} from "../../video/react";
import { useLatestRef } from "./use-latest-ref";
import { fittedImageSize } from "./image-fit";
import { rawImageRgba } from "./raw-image-rgba";

const DEFAULT_MIME_TYPE = "image/jpeg";
/** Trailing coalescing window for compressed grid-preview resize decodes. */
export const BITMAP_IMAGE_RESIZE_DEBOUNCE_MS = 100;

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
  /** Reports decoded bitmap bytes retained in addition to the host canvas. */
  readonly onBitmapRetainedBytesChange?: (retainedBytes: number) => void;
  /**
   * Reports the DECODED image's natural dimensions after each committed
   * decode — the contract annotation overlays position themselves by.
   */
  readonly onImageLoaded?: (width: number, height: number) => void;
  /**
   * Reports every successful display draw, including unchanged-bitmap redraws.
   * Consumers must deduplicate and treat the canvas as read-only: resizing or
   * drawing into it can synchronously trigger another display draw.
   */
  readonly onCanvasCommitted?: (
    canvas: HTMLCanvasElement,
    size: BitmapDrawSize,
  ) => void;
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
  /** See `BitmapImageViewProps.onCanvasCommitted`. */
  readonly onCanvasCommitted?: (
    canvas: HTMLCanvasElement,
    size: BitmapDrawSize,
  ) => void;
  readonly role?: string;
  readonly style?: CSSProperties;
}

/**
 * Props for rendering any image visualization without a GPU device.
 */
export interface BitmapImageFrameViewProps {
  readonly className?: string;
  readonly fit?: "contain" | "cover";
  readonly frame: CameraVisualization;
  /**
   * Reports a decode or canvas-paint failure. The previously committed frame
   * stays visible — errors never blank the canvas.
   */
  readonly onError?: (error: unknown) => void;
  readonly onBitmapRetainedBytesChange?: (retainedBytes: number) => void;
  readonly onImageLoaded?: (width: number, height: number) => void;
  /** See `BitmapImageViewProps.onCanvasCommitted`. */
  readonly onCanvasCommitted?: (
    canvas: HTMLCanvasElement,
    size: BitmapDrawSize,
  ) => void;
  readonly style?: CSSProperties;
  /** Stable source/stream owner key for encoded-video decoder cleanup. */
  readonly videoSessionKey?: string;
}

type CanvasDrawable = (HTMLCanvasElement | ImageBitmap) & {
  readonly height: number;
  readonly width: number;
  close?: () => void;
};

interface EncodedBitmapDecodeRequest {
  cancelled: boolean;
  readonly onError: (error: unknown) => void;
  readonly onSuccess: (bitmap: ImageBitmap) => void;
  readonly options: ImageBitmapOptions;
  readonly source: Blob;
}

/** One running browser decode plus one replaceable latest request. */
class LatestEncodedBitmapDecoder {
  private active: EncodedBitmapDecodeRequest | null = null;
  private pending: EncodedBitmapDecodeRequest | null = null;

  request(
    source: Blob,
    options: ImageBitmapOptions,
    onSuccess: (bitmap: ImageBitmap) => void,
    onError: (error: unknown) => void,
  ): () => void {
    const request: EncodedBitmapDecodeRequest = {
      cancelled: false,
      onError,
      onSuccess,
      options,
      source,
    };
    if (this.active) {
      if (this.pending) this.pending.cancelled = true;
      this.pending = request;
    } else {
      this.start(request);
    }

    return () => {
      request.cancelled = true;
      if (this.pending === request) this.pending = null;
    };
  }

  private start(request: EncodedBitmapDecodeRequest): void {
    this.active = request;
    createImageBitmap(request.source, request.options).then(
      (bitmap) => {
        try {
          if (request.cancelled) {
            bitmap.close();
          } else {
            request.onSuccess(bitmap);
          }
        } catch (error) {
          if (!request.cancelled) request.onError(error);
        } finally {
          this.finish(request);
        }
      },
      (error) => {
        try {
          if (!request.cancelled) request.onError(error);
        } finally {
          this.finish(request);
        }
      },
    );
  }

  private finish(request: EncodedBitmapDecodeRequest): void {
    if (this.active !== request) return;
    this.active = null;
    const pending = this.pending;
    this.pending = null;
    if (pending && !pending.cancelled) this.start(pending);
  }
}

/**
 * Destination rect for drawing an image of `image` size into `container`,
 * center-aligned. Identical math to `imageDisplayRect` in
 * `Base2dScene.tsx` (the WebGPU `ImagePanel` path) — "cover" fills the
 * container and overflows the shorter axis symmetrically (the canvas
 * clips the overflow), "contain" letterboxes.
 */
export function bitmapDrawRect(
  container: BitmapDrawSize,
  image: BitmapDrawSize,
  fit: "contain" | "cover",
): BitmapDrawRect {
  const { height, width } = fittedImageSize(container, image, fit);

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
function useBitmapCanvas(
  fit: "contain" | "cover",
  trackCssSize = false,
  onCanvasCommitted?: BitmapImageViewProps["onCanvasCommitted"],
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cssSize, setCssSize] = useState<BitmapDrawSize | null>(null);
  // The committed bitmap — stays drawn until the NEXT commit lands, so
  // frame advances and errors never flash an empty canvas (the behavior
  // ImagePanel gets from hasVisibleImageRef).
  const bitmapRef = useRef<CanvasDrawable | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const onCanvasCommittedRef = useLatestRef(onCanvasCommitted);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    if (!canvas) {
      return;
    }

    // Backing store follows the canvas's CSS size at DPR 1 — deliberate
    // parity with WebGpuCanvas's DEFAULT_DPR = 1; raising preview DPR is
    // a follow-up decision, not a side effect of this path. Clamped ≥1×1
    // so a not-yet-laid-out cell never creates a zero-size canvas.
    const layoutRect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(layoutRect.width));
    const height = Math.max(1, Math.round(layoutRect.height));
    if (trackCssSize) {
      setCssSize((current) =>
        current?.width === width && current.height === height
          ? current
          : { height, width },
      );
    }
    if (canvas.width !== width) {
      canvas.width = width;
    }
    if (canvas.height !== height) {
      canvas.height = height;
    }

    // A detached (closed) bitmap reports 0x0; drawing it would throw.
    // The backing store and tracked decode size still update without one.
    if (!bitmap || bitmap.width === 0 || bitmap.height === 0) {
      return;
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
    try {
      onCanvasCommittedRef.current?.(canvas, { height, width });
    } catch (error) {
      // Poster capture is optional optimization work and cannot fail display.
      if (import.meta.env.DEV) {
        console.warn(
          "onCanvasCommitted threw; display draw is unaffected",
          error,
        );
      }
    }
  }, [onCanvasCommittedRef, trackCssSize]);

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
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    draw();
    if (typeof ResizeObserver === "undefined") {
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

  return { canvasRef, commit, cssSize };
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
  onBitmapRetainedBytesChange,
  onCanvasCommitted,
  onError,
  onImageLoaded,
  style,
}: BitmapImageViewProps) {
  const { canvasRef, commit, cssSize } = useBitmapCanvas(
    fit,
    true,
    onCanvasCommitted,
  );
  const decodeSize = useDebouncedBitmapDecodeSize(cssSize);
  const decoderRef = useRef<LatestEncodedBitmapDecoder | null>(null);
  if (decoderRef.current === null) {
    decoderRef.current = new LatestEncodedBitmapDecoder();
  }
  const onErrorRef = useLatestRef(onError);
  const onImageLoadedRef = useLatestRef(onImageLoaded);
  const onBitmapRetainedBytesChangeRef = useLatestRef(
    onBitmapRetainedBytesChange,
  );

  // This effect decodes the current bytes and commits the resulting
  // bitmap. The cleanup flag is the out-of-order guard: only the latest
  // request may commit — a superseded decode (newer bytes arrived, or
  // unmount) closes its own bitmap and leaves the previous frame drawn.
  useEffect(() => {
    if (!decodeSize) {
      return undefined;
    }

    const imageSize = encodedImageDimensions(bytes);
    const options = imageSize
      ? bitmapDecodeOptions(decodeSize, imageSize, fit)
      : ({ colorSpaceConversion: "none" } satisfies ImageBitmapOptions);
    return decoderRef.current?.request(
      new Blob([bytes as BlobPart], { type: mimeType ?? DEFAULT_MIME_TYPE }),
      options,
      (bitmap) => {
        commit(bitmap);
        onBitmapRetainedBytesChangeRef.current?.(
          bitmap.width * bitmap.height * 4,
        );
        onImageLoadedRef.current?.(
          imageSize?.width ?? bitmap.width,
          imageSize?.height ?? bitmap.height,
        );
      },
      (error) => {
        // Keep the last good frame; only report.
        onErrorRef.current?.(error);
      },
    );
  }, [
    bytes,
    commit,
    decodeSize,
    fit,
    mimeType,
    onBitmapRetainedBytesChangeRef,
    onErrorRef,
    onImageLoadedRef,
  ]);

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
  onBitmapRetainedBytesChange,
  onCanvasCommitted,
  onError,
  onImageLoaded,
  style,
  videoSessionKey,
}: BitmapImageFrameViewProps) {
  if (frame.kind === "encoded-video") {
    return (
      <BitmapEncodedVideoView
        className={className}
        frame={frame}
        fit={fit}
        onError={onError}
        onBitmapRetainedBytesChange={onBitmapRetainedBytesChange}
        onCanvasCommitted={onCanvasCommitted}
        onImageLoaded={onImageLoaded}
        style={style}
        videoSessionKey={videoSessionKey}
      />
    );
  }

  return frame.kind === "raw-image" ? (
    <BitmapRawImageView
      className={className}
      fit={fit}
      frame={frame}
      onError={onError}
      onBitmapRetainedBytesChange={onBitmapRetainedBytesChange}
      onCanvasCommitted={onCanvasCommitted}
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
      onBitmapRetainedBytesChange={onBitmapRetainedBytesChange}
      onCanvasCommitted={onCanvasCommitted}
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
  onBitmapRetainedBytesChange,
  onCanvasCommitted,
  onImageLoaded,
  style,
  videoSessionKey,
}: Omit<BitmapImageFrameViewProps, "frame"> & {
  readonly frame: EncodedVideoVisualization;
}) {
  const { canvasRef, commit } = useBitmapCanvas(fit, false, onCanvasCommitted);
  const onErrorRef = useLatestRef(onError);
  const onImageLoadedRef = useLatestRef(onImageLoaded);
  const onBitmapRetainedBytesChangeRef = useLatestRef(
    onBitmapRetainedBytesChange,
  );
  const fallbackPreviewTextureKey = useId();
  const previewTextureKey = videoSessionKey ?? fallbackPreviewTextureKey;
  const contextManager = useOptionalVideoPlaybackManager();
  const [ownedManager, setOwnedManager] = useState<{
    readonly key: string;
    readonly manager: VideoPlaybackManager;
    readonly reader: PushVideoAccessUnitReader;
  } | null>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (contextManager) {
      setOwnedManager(null);
      return undefined;
    }
    const owned = new VideoPlaybackManager(
      `bitmap-preview:${previewTextureKey}`,
    );
    const reader = new PushVideoAccessUnitReader();
    owned.setReader(reader);
    const registration = { key: previewTextureKey, manager: owned, reader };
    setOwnedManager(registration);
    return () => {
      owned.close();
      reader.clear();
      setOwnedManager((current) => (current === registration ? null : current));
    };
  }, [contextManager, previewTextureKey]);
  const localManager =
    ownedManager?.key === previewTextureKey ? ownedManager.manager : null;
  const manager = contextManager ?? localManager;
  const targetTimeNs = frame.timestampNs ?? null;
  const hasPrivateRunway =
    targetTimeNs !== null &&
    (frame.keyframe ||
      ownedManager?.reader.hasRetainedKeyframeAtOrBefore(
        previewTextureKey,
        targetTimeNs,
      ) === true);
  useEffect(() => {
    if (
      contextManager ||
      ownedManager?.key !== previewTextureKey ||
      frame.codec !== "h264" ||
      targetTimeNs === null ||
      !hasPrivateRunway
    ) {
      return;
    }
    ownedManager.reader.push(previewTextureKey, {
      frame,
      timeNs: targetTimeNs,
    });
  }, [
    contextManager,
    frame,
    hasPrivateRunway,
    ownedManager,
    previewTextureKey,
    targetTimeNs,
  ]);
  const snapshot = useVideoStreamPresentation({
    enabled:
      frame.codec === "h264" &&
      targetTimeNs !== null &&
      (contextManager !== null || hasPrivateRunway),
    frame: frame.codec === "h264" ? frame : null,
    manager,
    priority: "visible",
    stream: previewTextureKey,
    targetTimeNs,
  });

  useEffect(() => {
    const presentation = snapshot.presentation;
    if (!presentation) {
      videoCanvasRef.current = null;
      onBitmapRetainedBytesChangeRef.current?.(0);
      return undefined;
    }
    const lease = presentation.acquire();
    if (!lease) {
      videoCanvasRef.current = null;
      onBitmapRetainedBytesChangeRef.current?.(0);
      return undefined;
    }
    try {
      let source = videoCanvasRef.current;
      if (!source) {
        source = document.createElement("canvas");
        videoCanvasRef.current = source;
      }
      if (source.width !== lease.width) source.width = lease.width;
      if (source.height !== lease.height) source.height = lease.height;
      const context = source.getContext("2d");
      if (!context) throw new Error("Unable to create video preview canvas");
      context.drawImage(lease.source, 0, 0, lease.width, lease.height);
      commit(source);
      onBitmapRetainedBytesChangeRef.current?.(
        source.width * source.height * 4,
      );
      onImageLoadedRef.current?.(source.width, source.height);
    } catch (error) {
      onErrorRef.current?.(error);
    } finally {
      lease.release();
    }
    return undefined;
  }, [
    commit,
    onBitmapRetainedBytesChangeRef,
    onErrorRef,
    onImageLoadedRef,
    snapshot.presentation,
  ]);

  useEffect(() => {
    if (frame.codec !== "h264") {
      onErrorRef.current?.(
        new Error(`Video codec ${frame.codec} is unsupported`),
      );
      return;
    }
    if (frame.codec === "h264" && targetTimeNs === null) {
      onErrorRef.current?.(
        new Error("H.264 preview frame is missing a presentation timestamp"),
      );
      return;
    }
    if (
      frame.codec === "h264" &&
      targetTimeNs !== null &&
      contextManager === null &&
      localManager !== null &&
      !hasPrivateRunway
    ) {
      onErrorRef.current?.(
        new Error("H.264 preview is waiting for a keyframe"),
      );
      return;
    }
    if (snapshot.diagnostic?.severity === "error") {
      onErrorRef.current?.(new Error(snapshot.diagnostic.message));
    }
  }, [
    contextManager,
    frame.codec,
    hasPrivateRunway,
    localManager,
    onErrorRef,
    snapshot.diagnostic,
    targetTimeNs,
  ]);

  useEffect(
    () => () => {
      videoCanvasRef.current = null;
      onBitmapRetainedBytesChangeRef.current?.(0);
    },
    [onBitmapRetainedBytesChangeRef],
  );

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
  onBitmapRetainedBytesChange,
  onCanvasCommitted,
  onImageLoaded,
  style,
}: Omit<BitmapImageFrameViewProps, "frame"> & {
  readonly frame: RawImageVisualization;
}) {
  const { canvasRef, commit, cssSize } = useBitmapCanvas(
    fit,
    true,
    onCanvasCommitted,
  );
  const previewSize = useDebouncedBitmapDecodeSize(cssSize);
  const onErrorRef = useLatestRef(onError);
  const onImageLoadedRef = useLatestRef(onImageLoaded);
  const onBitmapRetainedBytesChangeRef = useLatestRef(
    onBitmapRetainedBytesChange,
  );
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!previewSize) return;
    try {
      let source = sourceCanvasRef.current;
      if (!source) {
        source = document.createElement("canvas");
        sourceCanvasRef.current = source;
      }
      canvasFromRawImage(frame, source, previewSize, fit);
      commit(source);
      onBitmapRetainedBytesChangeRef.current?.(
        source.width * source.height * 4,
      );
      onImageLoadedRef.current?.(frame.width, frame.height);
    } catch (error) {
      onErrorRef.current?.(error);
    }
  }, [
    commit,
    fit,
    frame,
    onBitmapRetainedBytesChangeRef,
    onErrorRef,
    onImageLoadedRef,
    previewSize,
  ]);

  // This effect explicitly releases the tile-sized staging backing store.
  useEffect(
    () => () => {
      const source = sourceCanvasRef.current;
      sourceCanvasRef.current = null;
      if (source) {
        source.width = 0;
        source.height = 0;
      }
    },
    [],
  );

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
 * Chooses a decode size that preserves source aspect while producing only the
 * pixels the grid tile can display.
 */
export function bitmapDecodeOptions(
  container: BitmapDrawSize,
  image: BitmapDrawSize,
  fit: "contain" | "cover",
): ImageBitmapOptions {
  const rect = bitmapDrawRect(container, image, fit);
  const resizeWidth = Math.max(1, Math.min(image.width, Math.ceil(rect.width)));
  const resizeHeight = Math.max(
    1,
    Math.min(image.height, Math.ceil(rect.height)),
  );

  return {
    colorSpaceConversion: "none",
    ...(resizeWidth < image.width || resizeHeight < image.height
      ? { resizeHeight, resizeQuality: "high", resizeWidth }
      : {}),
  };
}

function useDebouncedBitmapDecodeSize(
  size: BitmapDrawSize | null,
): BitmapDrawSize | null {
  const [debouncedSize, setDebouncedSize] = useState<BitmapDrawSize | null>(
    null,
  );

  useEffect(() => {
    if (!size) return undefined;
    if (!debouncedSize) {
      setDebouncedSize(size);
      return undefined;
    }
    if (
      debouncedSize.width === size.width &&
      debouncedSize.height === size.height
    ) {
      return undefined;
    }

    const timer = setTimeout(
      () => setDebouncedSize(size),
      BITMAP_IMAGE_RESIZE_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [debouncedSize, size]);

  return debouncedSize;
}

/** Reads intrinsic JPEG, PNG, or WebP dimensions without decoding pixels. */
export function encodedImageDimensions(
  bytes: Uint8Array,
): BitmapDrawSize | null {
  return pngDimensions(bytes) ?? jpegDimensions(bytes) ?? webpDimensions(bytes);
}

function pngDimensions(bytes: Uint8Array): BitmapDrawSize | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    ascii(bytes, 12, 16) !== "IHDR"
  ) {
    return null;
  }
  return validImageSize(readUint32Be(bytes, 16), readUint32Be(bytes, 20));
}

function jpegDimensions(bytes: Uint8Array): BitmapDrawSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 8 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset++;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) {
      return null;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= bytes.length) {
      return null;
    }
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null;
    }
    if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
      return validImageSize(
        (bytes[offset + 5] << 8) | bytes[offset + 6],
        (bytes[offset + 3] << 8) | bytes[offset + 4],
      );
    }
    offset += segmentLength;
  }
  return null;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function webpDimensions(bytes: Uint8Array): BitmapDrawSize | null {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X") {
    return validImageSize(
      1 + readUint24Le(bytes, 24),
      1 + readUint24Le(bytes, 27),
    );
  }
  if (
    chunk === "VP8 " &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return validImageSize(
      ((bytes[27] << 8) | bytes[26]) & 0x3fff,
      ((bytes[29] << 8) | bytes[28]) & 0x3fff,
    );
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits =
      bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return validImageSize(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
  }
  return null;
}

function validImageSize(width: number, height: number): BitmapDrawSize | null {
  return width > 0 && height > 0 ? { height, width } : null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 2 ** 24 +
    bytes[offset + 1] * 2 ** 16 +
    bytes[offset + 2] * 2 ** 8 +
    bytes[offset + 3]
  );
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function canvasFromRawImage(
  frame: RawImageVisualization,
  canvas: HTMLCanvasElement,
  container: BitmapDrawSize,
  fit: "contain" | "cover",
): void {
  const options = bitmapDecodeOptions(
    container,
    { height: frame.height, width: frame.width },
    fit,
  );
  const previewWidth = options.resizeWidth ?? frame.width;
  const previewHeight = options.resizeHeight ?? frame.height;
  if (canvas.width !== previewWidth) {
    canvas.width = previewWidth;
  }
  if (canvas.height !== previewHeight) {
    canvas.height = previewHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create raw image canvas context");
  }

  const imageData = context.createImageData(previewWidth, previewHeight);
  copyRawImagePreview(frame, imageData.data, previewWidth, previewHeight);
  context.putImageData(imageData, 0, 0);
}

function copyRawImagePreview(
  frame: RawImageVisualization,
  target: Uint8ClampedArray,
  targetWidth: number,
  targetHeight: number,
): void {
  const rgba = rawImageRgba(frame);
  const sourceLength = frame.width * frame.height * 4;
  if (targetWidth === frame.width && targetHeight === frame.height) {
    target.set(rgba.subarray(0, sourceLength));
    return;
  }

  // Center-sampled nearest-neighbor reduction preserves exact raw channel
  // bytes while avoiding a second full-resolution RGBA backing store.
  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = Math.min(
      frame.height - 1,
      Math.floor(((targetY + 0.5) * frame.height) / targetHeight),
    );
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = Math.min(
        frame.width - 1,
        Math.floor(((targetX + 0.5) * frame.width) / targetWidth),
      );
      const sourceOffset = (sourceY * frame.width + sourceX) * 4;
      const targetOffset = (targetY * targetWidth + targetX) * 4;
      target[targetOffset] = rgba[sourceOffset];
      target[targetOffset + 1] = rgba[sourceOffset + 1];
      target[targetOffset + 2] = rgba[sourceOffset + 2];
      target[targetOffset + 3] = rgba[sourceOffset + 3];
    }
  }
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
  onCanvasCommitted,
  role = "img",
  style,
}: BitmapCanvasHostProps) {
  const { canvasRef, commit } = useBitmapCanvas(fit, false, onCanvasCommitted);

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
