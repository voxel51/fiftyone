import { useViewportInitReveal } from "@fiftyone/lighter";
import React, { useEffect, useRef, useState } from "react";
import { usePublishCurrentFrame, useStream } from "@fiftyone/playback";
import { useLighterSelectionBridge } from "../../../core/src/components/Modal/Lighter/useLighterSelectionEventHandler";
import { useLighterTooltipEventHandler } from "../../../core/src/components/Modal/Lighter/useLighterTooltipEventHandler";
import { useLighterMediaScene } from "../hooks/useLighterMediaScene";
import { useCurrentFrame } from "../state/useCurrentFrame";
import { IMAVID_STREAM_ID } from "../utils/ids";
import type { ImaVidImageFrame } from "../streams/ImaVidImageStream";
import { AnnotateSync, ExploreSync, type SurfaceMode } from "./SurfaceSync";
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

    if (dims === null || dims.w !== w || dims.h !== h) {
      setDims({ w, h });
    }
  }, [frame, dims, canvasRef]);

  return dims;
}

/**
 * Publish the playhead frame for consumers outside the `PlaybackProvider`:
 * the modal's action bar is a sibling of the media container, and its label
 * selection has to agree with the canvas about which frame is current.
 */
const PublishPlayheadFrame: React.FC = () => {
  usePublishCurrentFrame(useCurrentFrame());
  return null;
};

/**
 * ImaVid tile — draws each frame's `ImageBitmap` (decoded off-main in
 * `framesWorker`) into a `<canvas>` and overlays Lighter on top.
 *
 * Drawn via 2D `drawImage`, not a `bitmaprenderer` context, because the LRU
 * may serve the same bitmap again (a revisited frame) and
 * `transferFromImageBitmap` would consume it.
 *
 * `mode` picks the same halves `LighterVideo` does: `annotate` (the default)
 * arms the editing sync bundle on a writable scene, while `explore` locks the
 * scene read-only with the sidebar's filters applied and wires the tooltip,
 * the `fos.selectedLabels` bridge and the published playhead frame.
 */
export const ImaVidLighterTile: React.FC<{
  mode?: SurfaceMode;
  onRevealChange?: (revealed: boolean) => void;
}> = ({ mode = "annotate", onRevealChange }) => {
  const sourceId = IMAVID_STREAM_ID;
  const explore = mode === "explore";

  const lighterHostRef = useRef<HTMLDivElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Latest decoded frame; the image stream dedupes on frameNumber so this
  // only changes when the frame actually changes.
  const frame = useStream<ImaVidImageFrame>(sourceId);

  const imageDims = usePaintFrameToCanvas(frame, frameCanvasRef);

  // Scene lifecycle: once-per-mount scene; `dims` from the decoded bitmap.
  // The explore flags are the ones `LighterVideo` sets, for the same reasons.
  const { scene, canonicalMediaReady } = useLighterMediaScene({
    hostRef: lighterHostRef,
    dims: imageDims,
    sceneIdPrefix: "imavid-anno",
    readOnly: explore,
    multipleSelection: explore,
    filterLabels: explore,
  });

  const revealed = useViewportInitReveal(scene);
  useEffect(() => {
    onRevealChange?.(revealed);
  }, [revealed, onRevealChange]);

  // Explore only, routed at the undefined channel otherwise: Annotate never
  // had a tooltip, and its selection belongs to the annotation engine.
  useLighterTooltipEventHandler(explore ? scene : null);
  useLighterSelectionBridge(explore ? scene : null);

  const Sync = explore ? ExploreSync : AnnotateSync;

  return (
    <div className={styles.body}>
      <canvas
        ref={frameCanvasRef}
        className={styles.frame}
        data-cy="imavid-frame-canvas"
      />
      <div ref={lighterHostRef} className={styles.lighterHost} />
      {/* Overlay / sidebar sync. `frameCanvasRef` keeps the frame canvas
          zoomed/panned with the Lighter viewport so scroll-zoom scales the
          picture. */}
      <Sync
        scene={scene}
        canonicalMediaReady={canonicalMediaReady}
        mediaRef={frameCanvasRef}
      />
      {explore && <PublishPlayheadFrame />}
    </div>
  );
};
