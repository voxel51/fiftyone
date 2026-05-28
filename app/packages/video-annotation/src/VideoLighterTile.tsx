import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import { ExternalCanonicalMedia } from "./ExternalCanonicalMedia";
import { colorScheme, colorSeed, useModalLookerOptions } from "@fiftyone/state";
import { singletonCanvas } from "../../core/src/components/Modal/Lighter/SharedCanvas";
import { usePlayback } from "../../playback/src/lib/playback/PlaybackProvider";
import { useStream } from "../../playback/src/lib/playback/use-stream";
import { useVideoStream } from "../../playback/src/lib/playback/use-video-stream";
import { useVideoSync } from "../../playback/src/lib/playback/use-video-sync";
import { useVfcClockSource } from "./useVfcClockSource";
import { useTileSource } from "@fiftyone/tiling";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";
import { LABELS_STREAM_ID, VIDEO_STREAM_ID } from "./ids";
import type { FrameLabelSnapshot } from "./SyntheticLabelStream";
import { useFrameOverlaySync } from "./useFrameOverlaySync";
import { useSyncLighterAnnotation } from "./useSyncLighterAnnotation";
import { useSyncSidebarFromSnapshot } from "./useSyncSidebarFromSnapshot";
import { useSyncLighterLabelStream } from "./useSyncLighterLabelStream";
import styles from "./VideoLighterTile.module.css";

export interface VideoLighterTileProps {
  /** Resolved media URL for the video. */
  videoSrc: string;
  /**
   * // todo - multiple fields
   * Schema field name the labels are reported under. Should match a real
   * field on the dataset so activePaths / color-mapping flow through.
   */
  field?: string;
}

// todo - annotation state
const DEFAULT_FIELD = "synthetic_detections";

/**
 * <video> bound to the playback engine, Lighter overlaid on top,
 * Overlays diffed in from the labels stream each commit.
 */
export const VideoLighterTile: React.FC<VideoLighterTileProps> = ({
  videoSrc,
  field = DEFAULT_FIELD,
}) => {
  const sourceId = useTileSource() ?? VIDEO_STREAM_ID;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lighterHostRef = useRef<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(
    null
  );

  // Bind <video> -> playback engine. The video-annotation tile uses
  // video-anchored playback: `useVfcClockSource` registers the
  // element's vfc-presented mediaTime as the engine's clock source,
  // so the engine commits exactly where the picture is. We pass
  // `blocking: false` to `useVideoStream` because the clock source
  // already owns presentation time — gating the engine again on the
  // stream's bufferState would produce spurious stalls.
  useVideoStream(sourceId, videoRef, { blocking: false });
  useVideoSync(videoRef);
  useVfcClockSource(videoRef);
  const { seek } = usePlayback();

  // Attach the SINGLETON Lighter canvas into our host. There is one
  // SharedPixiApplication per page bound to the first canvas it ever sees;
  // creating a fresh canvas for the video tile would leave Pixi rendering
  // to the old (image-modal) canvas instead. singletonCanvas detaches
  // cleanly from any previous container and reattaches here.
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

  // Modal options so activePaths / showOverlays / alpha match the
  // sidebar and overlays.
  const options = useModalLookerOptions();
  const sceneId = useMemo(
    () => `video-anno-${Math.random().toString(36).slice(2, 9)}`,
    [videoSrc]
  );
  const { scene } = useLighterSetupWithPixi(canvas!, options, sceneId);

  // Wire the FiftyOne color scheme so overlays match the rest of the UI.
  const scheme = useRecoilValue(colorScheme);
  const seed = useRecoilValue(colorSeed);
  useEffect(() => {
    if (!scene || scene.getSceneId() !== sceneId) {
      return;
    }

    scene.updateColorMappingContext({ colorScheme: scheme, seed });
  }, [scene, sceneId, scheme, seed]);

  // Tracks whether the *current* scene has its canonical media installed.
  // The overlay diff effect (`useFrameOverlaySync`) gates on this — without
  // canonical media, overlays added to the scene have no coordinate
  // context to position against, so they render with broken bounds and a
  // later in-place `relativeBounds` update doesn't fix them. We reset the
  // flag whenever `sceneId` changes (new scene → not installed yet) and set
  // it true at the bottom of the install effect.
  const [canonicalMediaReady, setCanonicalMediaReady] = useState(false);
  useEffect(() => {
    setCanonicalMediaReady(false);
  }, [sceneId]);

  // Install a no-pixel canonical-media overlay sized to the video's intrinsic
  // resolution. Lighter draws overlays relative to it; the <video>
  // behind the canvas provides the visible pixels.
  useEffect(() => {
    if (!scene || !videoDims) {
      return;
    }

    if (scene.getSceneId() !== sceneId) {
      return;
    }

    const media = new ExternalCanonicalMedia({
      width: videoDims.w,
      height: videoDims.h,
    });

    scene.addOverlay(media);
    scene.setCanonicalMedia(media);
    setCanonicalMediaReady(true);
  }, [scene, sceneId, videoDims]);

  // Viewport init — without this the pixi-viewport never gets framed and
  // overlays render with zero / wrong coordinate transforms. We wait for
  // both renderer-ready and canonical media before fitting.
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
    if (!scene || !rendererReady || !videoDims) {
      return;
    }

    if (scene.getSceneId() !== sceneId) {
      return;
    }

    scene.fitToContent();
  }, [scene, sceneId, rendererReady, videoDims]);

  // Stream-driven overlay diff. Gate on canonical media being installed
  // on the current scene — see `canonicalMediaReady` above.
  const snapshot = useStream<FrameLabelSnapshot>(LABELS_STREAM_ID);
  useFrameOverlaySync(scene, snapshot, field, canonicalMediaReady);
  useSyncSidebarFromSnapshot(scene, snapshot, field, canonicalMediaReady);

  useSyncLighterAnnotation(scene);
  useSyncLighterLabelStream(scene);

  return (
    <div className={styles.body}>
      <video
        ref={videoRef}
        className={styles.video}
        src={videoSrc}
        preload="auto"
        playsInline
        muted
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setVideoDims({ w: v.videoWidth, h: v.videoHeight });
        }}
        onLoadedData={() => {
          // Force the engine to commit once now that the video stream is
          // ready. The engine's RAF loop is dormant while paused — without
          // a seek the label stream never gets `onCommit` called
          // and `useStream` stays at null, so no overlays paint on first
          // load.
          seek(0);
        }}
      />
      <div ref={lighterHostRef} className={styles.lighterHost} />
    </div>
  );
};
