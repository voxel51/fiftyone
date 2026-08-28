import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  setPresentedTime,
  usePlaybackStore,
  useStream,
} from "@fiftyone/playback";
import { useModalSample } from "@fiftyone/state";
import { getModalSampleFrameRate } from "../utils/modalSample";
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
  onPainted: (frameNumber: number | null) => void,
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
      onPainted(null);
      return;
    }

    // A closed `ImageBitmap` reports zero dimensions; drawing it throws
    // ("image source is detached"). Skip rather than crash — the current
    // canvas contents linger until the next live frame commits.
    const w = frame.bitmap.width;
    const h = frame.bitmap.height;
    if (w === 0 || h === 0) {
      return;
    }

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

    // The frame is on glass as of this draw — the presented-frame authority
    // for decoded tiles, the vfc callback's analogue
    onPainted(frame.frameNumber);

    if (dims === null || dims.w !== w || dims.h !== h) {
      setDims({ w, h });
    }
  }, [frame, dims, canvasRef, onPainted]);

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

  // The presented-frame authority for decoded tiles: publish the media time
  // of the bitmap the moment it is drawn, so overlay clocks track the
  // picture through a scrub instead of the requested playhead
  const store = usePlaybackStore();
  const sample = useModalSample();
  const fps = getModalSampleFrameRate(sample);
  const onPainted = useCallback(
    (frameNumber: number | null) => {
      setPresentedTime(
        store,
        frameNumber == null || !fps || fps <= 0
          ? null
          : (frameNumber - 1) / fps,
      );
    },
    [store, fps],
  );
  useEffect(() => () => setPresentedTime(store, null), [store]);

  const imageDims = usePaintFrameToCanvas(frame, frameCanvasRef, onPainted);

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
      <canvas
        ref={frameCanvasRef}
        className={styles.frame}
        data-cy="imavid-frame-canvas"
      />
      <div ref={lighterHostRef} className={styles.lighterHost} />
    </div>
  );
};
