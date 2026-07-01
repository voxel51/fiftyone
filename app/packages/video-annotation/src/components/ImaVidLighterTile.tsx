import React, { useEffect, useRef, useState } from "react";
import { useStream } from "@fiftyone/playback";
import { useLighterTileScene } from "../hooks/useLighterTileScene";
import { useVideoAnnotationSyncBundle } from "../hooks/useVideoAnnotationSyncBundle";
import { IMAVID_STREAM_ID } from "../utils/ids";
import type { ImaVidImageFrame } from "../streams/ImaVidImageStream";
import styles from "./ImaVidLighterTile.module.css";

interface ImageDimensions {
  w: number;
  h: number;
}

/**
 * Paint each decoded frame's bitmap into `canvasRef`, sizing the drawing
 * buffer to the bitmap's intrinsic dimensions (CSS keeps the element fitting
 * the host via `object-fit: contain`). Returns the current intrinsic
 * dimensions, which the caller feeds to the scene as canonical-media size.
 *
 * Smoothing is disabled around the draw so pixel-exact frames don't blur.
 */
function usePaintFrameToCanvas(
  frame: ImaVidImageFrame | undefined,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
): ImageDimensions | null {
  const [dims, setDims] = useState<ImageDimensions | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) {
      return;
    }

    // No frame: initial load, or a frame the stream gave up on (unresolvable
    // filepath / decode error) that the engine played through. Clear so the
    // black `.body` shows instead of the previous frame lingering on-canvas.
    if (!frame) {
      const ctx = canvasEl.getContext("2d");
      ctx?.clearRect(0, 0, canvasEl.width, canvasEl.height);
      return;
    }

    const w = frame.bitmap.width;
    const h = frame.bitmap.height;
    if (canvasEl.width !== w) {
      canvasEl.width = w;
    }

    if (canvasEl.height !== h) {
      canvasEl.height = h;
    }

    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      return;
    }

    const priorImageSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame.bitmap, 0, 0);
    ctx.imageSmoothingEnabled = priorImageSmoothing;

    if (dims === null || dims.w !== w || dims.h !== h) {
      setDims({ w, h });
    }
  }, [frame, dims, canvasRef]);

  return dims;
}

/**
 * ImaVid tile — draws each frame's `ImageBitmap` (decoded off-main in
 * `framesWorker`) into a `<canvas>` and overlays Lighter on top.
 *
 * Drawn via 2D `drawImage`, not a `bitmaprenderer` context, because the LRU
 * may serve the same bitmap again (a revisited frame) and
 * `transferFromImageBitmap` would consume it.
 */
export const ImaVidLighterTile: React.FC = () => {
  const sourceId = IMAVID_STREAM_ID;

  const lighterHostRef = useRef<HTMLDivElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Latest decoded frame; the image stream dedupes on frameNumber so this
  // only changes when the frame actually changes.
  const frame = useStream<ImaVidImageFrame>(sourceId);

  const imageDims = usePaintFrameToCanvas(frame, frameCanvasRef);

  // Scene lifecycle: once-per-mount scene; `dims` from the decoded bitmap.
  const { scene, canonicalMediaReady } = useLighterTileScene({
    hostRef: lighterHostRef,
    dims: imageDims,
    sceneIdPrefix: "imavid-anno",
  });

  // Overlay / sidebar sync. `frameCanvasRef` keeps the frame canvas
  // zoomed/panned with the Lighter viewport so scroll-zoom scales the picture.
  useVideoAnnotationSyncBundle({
    scene,
    canonicalMediaReady,
    mediaRef: frameCanvasRef,
  });

  return (
    <div className={styles.body}>
      <canvas ref={frameCanvasRef} className={styles.frame} />
      <div ref={lighterHostRef} className={styles.lighterHost} />
    </div>
  );
};
