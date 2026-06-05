import { useTileSource } from "@fiftyone/tiling";
import React, { useEffect, useRef, useState } from "react";
import { useStream } from "../../../playback/src/lib/playback/use-stream";
import { useLighterTileScene } from "../hooks/useLighterTileScene";
import { useVideoAnnotationSyncBundle } from "../hooks/useVideoAnnotationSyncBundle";
import { IMAVID_STREAM_ID } from "../utils/ids";
import type { ImaVidImageFrame } from "../streams/ImaVidImageStream";
import styles from "./ImaVidLighterTile.module.css";

export interface ImaVidLighterTileProps {
  /**
   * Schema field name the labels are reported under. Threaded through
   * the overlays so activePaths / color-mapping flow.
   */
  field: string;
}

/**
 * ImaVid tile — draws each frame's `ImageBitmap` (decoded off-main in
 * `framesWorker`) into a `<canvas>` and overlays Lighter on top.
 *
 * The bitmap is rendered via 2D `drawImage` rather than transferred
 * via a `bitmaprenderer` context, because the LRU may serve the same
 * bitmap multiple times (a frame revisited after scrub) and
 * `transferFromImageBitmap` would consume it.
 */
export const ImaVidLighterTile: React.FC<ImaVidLighterTileProps> = ({
  field,
}) => {
  // Honor any active tile source override (e.g. for split-tile layouts),
  // but default to the imavid stream id when no override is set.
  const sourceId = useTileSource() ?? IMAVID_STREAM_ID;

  const lighterHostRef = useRef<HTMLDivElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(
    null
  );

  // Latest decoded frame from the playback engine. Each tick republishes
  // the new {bitmap, frameNumber, sampleId}; the image stream dedupes on
  // frameNumber so this only changes when the frame actually changes.
  const frame = useStream<ImaVidImageFrame>(sourceId);

  // Scene lifecycle (singleton canvas, pixi setup, color scheme, canonical
  // media, viewport fit). A once-per-mount scene; `dims` from the decoded
  // bitmap's intrinsic resolution (discovered in the paint effect below).
  const { scene, canonicalMediaReady } = useLighterTileScene({
    hostRef: lighterHostRef,
    dims: imageDims,
    sceneIdPrefix: "imavid-anno",
  });

  // Overlay / sidebar sync. `frameCanvasRef` keeps the frame canvas
  // zoomed/panned with the Lighter viewport so scroll-zoom scales the
  // picture, not just the overlays.
  useVideoAnnotationSyncBundle({
    scene,
    field,
    canonicalMediaReady,
    mediaRef: frameCanvasRef,
  });

  // Paint the current frame's bitmap into the canvas. Sets the canvas
  // drawing buffer to the bitmap's intrinsic dimensions on first paint
  // (and on any dimension change — shouldn't happen for to_frames
  // materialized clips, but harmless if it does). CSS sizing keeps the
  // displayed element fitting the host with `object-fit: contain`.
  useEffect(() => {
    if (!frame) {
      return;
    }

    const canvasEl = frameCanvasRef.current;
    if (!canvasEl) {
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

    if (imageDims === null || imageDims.w !== w || imageDims.h !== h) {
      setImageDims({ w, h });
    }
  }, [frame, imageDims]);

  return (
    <div className={styles.body}>
      <canvas ref={frameCanvasRef} className={styles.frame} />
      <div ref={lighterHostRef} className={styles.lighterHost} />
    </div>
  );
};
