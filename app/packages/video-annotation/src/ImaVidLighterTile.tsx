import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import { colorScheme, colorSeed, useModalLookerOptions } from "@fiftyone/state";
import { useTileSource } from "@fiftyone/tiling";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";
import { singletonCanvas } from "../../core/src/components/Modal/Lighter/SharedCanvas";
import { useStream } from "../../playback/src/lib/playback/use-stream";
import { ExternalCanonicalMedia } from "./ExternalCanonicalMedia";
import { IMAVID_STREAM_ID, LABELS_STREAM_ID } from "./ids";
import type { ImaVidImageFrame } from "./ImaVidImageStream";
import type { FrameLabelSnapshot } from "./SyntheticLabelStream";
import { useFrameOverlaySync } from "./useFrameOverlaySync";
import { useTemporalOverlaySync } from "./useTemporalOverlaySync";
import { useSyncLighterAnnotation } from "./useSyncLighterAnnotation";
import { useSyncSidebarFromSnapshot } from "./useSyncSidebarFromSnapshot";
import { useSyncLighterLabelStream } from "./useSyncLighterLabelStream";
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
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(
    null
  );

  // Latest decoded frame from the playback engine. Each tick republishes
  // the new {bitmap, frameNumber, sampleId}; the image stream dedupes on
  // frameNumber so this only changes when the frame actually changes.
  const frame = useStream<ImaVidImageFrame>(sourceId);

  // Same singleton-canvas dance as the video tile. There is one
  // SharedPixiApplication per page bound to the first canvas it ever
  // sees; creating a fresh canvas here would leave Pixi rendering to
  // the wrong one.
  useEffect(() => {
    const host = lighterHostRef.current;
    if (!host) {
      return;
    }

    setCanvas(singletonCanvas.getCanvas(host));

    return () => {
      singletonCanvas.detach();
    };
  }, []);

  const options = useModalLookerOptions();
  const sceneId = useMemo(
    () => `imavid-anno-${Math.random().toString(36).slice(2, 9)}`,
    []
  );
  const { scene } = useLighterSetupWithPixi(canvas!, options, sceneId);

  // FiftyOne color scheme → Lighter coordinator.
  const scheme = useRecoilValue(colorScheme);
  const seed = useRecoilValue(colorSeed);
  useEffect(() => {
    if (!scene || scene.getSceneId() !== sceneId) {
      return;
    }

    scene.updateColorMappingContext({ colorScheme: scheme, seed });
  }, [scene, sceneId, scheme, seed]);

  // Canonical-media installation gate — see VideoLighterTile for the
  // why. Reset on sceneId change; flip true once installed.
  const [canonicalMediaReady, setCanonicalMediaReady] = useState(false);
  useEffect(() => {
    setCanonicalMediaReady(false);
  }, [sceneId]);

  useEffect(() => {
    if (!scene || !imageDims) {
      return;
    }

    if (scene.getSceneId() !== sceneId) {
      return;
    }

    const media = new ExternalCanonicalMedia({
      width: imageDims.w,
      height: imageDims.h,
    });

    scene.addOverlay(media);
    scene.setCanonicalMedia(media);
    setCanonicalMediaReady(true);
  }, [scene, sceneId, imageDims]);

  // Viewport init.
  const [rendererReady, setRendererReady] = useState(false);
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  useEventHandler(
    "lighter:renderer-ready",
    useCallback(() => setRendererReady(true), []),
    { once: true }
  );

  useEffect(() => {
    if (!scene || !rendererReady || !imageDims) {
      return;
    }

    if (scene.getSceneId() !== sceneId) {
      return;
    }

    scene.fitToContent();
  }, [scene, sceneId, rendererReady, imageDims]);

  // Overlay diff — same hook the video tile uses.
  const snapshot = useStream<FrameLabelSnapshot>(LABELS_STREAM_ID);
  useFrameOverlaySync(scene, snapshot, field, canonicalMediaReady);
  useTemporalOverlaySync(scene, canonicalMediaReady);
  useSyncSidebarFromSnapshot(scene, snapshot, field, canonicalMediaReady);

  useSyncLighterAnnotation(scene);
  useSyncLighterLabelStream(scene);

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
