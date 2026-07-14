import React, { useRef, useState } from "react";
import { usePlayback, useVideoStream, useVideoSync } from "@fiftyone/playback";
import { useLighterTileScene } from "../hooks/useLighterTileScene";
import { useVfcClockSource } from "../hooks/useVfcClockSource";
import { useVideoAnnotationSyncBundle } from "../hooks/useVideoAnnotationSyncBundle";
import { VIDEO_STREAM_ID } from "../utils/ids";
import styles from "./VideoLighterTile.module.css";

export interface VideoLighterTileProps {
  /** Resolved media URL for the video. */
  videoSrc: string;
}

/**
 * <video> bound to the playback engine, Lighter overlaid on top,
 * Overlays diffed in from the labels stream each commit.
 */
export const VideoLighterTile: React.FC<VideoLighterTileProps> = ({
  videoSrc,
}) => {
  const sourceId = VIDEO_STREAM_ID;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lighterHostRef = useRef<HTMLDivElement | null>(null);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(
    null,
  );

  // Tracks which `videoSrc` we've already kicked the engine for. The
  // `loadeddata` event can fire more than once on the same element
  // (e.g. after `currentTime =` writes that cross an unbuffered range
  // the browser has to refetch — readyState dips below HAVE_CURRENT_DATA
  // and recovers, firing `loadeddata` again). Without this guard each
  // such recovery would `seek(0)` and yank the playhead back to the
  // start mid-session. We only want the first load per source — that's
  // the one that needs the kick so overlays paint on initial mount.
  const kickedSrcRef = useRef<string | null>(null);

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

  // Scene lifecycle (singleton canvas, pixi setup, color scheme, canonical
  // media, viewport fit). A fresh scene per `videoSrc` so a new source video
  // gets its own scene; `dims` from the <video>'s intrinsic resolution.
  const { scene, canonicalMediaReady } = useLighterTileScene({
    hostRef: lighterHostRef,
    dims: videoDims,
    sceneIdPrefix: "video-anno",
    sceneIdDeps: [videoSrc],
  });

  // Overlay / sidebar sync. `videoRef` keeps the <video> zoomed/panned with
  // the Lighter viewport so scroll-zoom scales the picture, not just overlays.
  useVideoAnnotationSyncBundle({
    scene,
    canonicalMediaReady,
    mediaRef: videoRef,
  });

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
          //
          // Guarded so a re-fire of `loadeddata` later in the session
          // (after a seek that crossed an unbuffered range, etc.) does
          // NOT reset the playhead. We only kick the engine on the
          // FIRST `loadeddata` per `videoSrc`.
          if (kickedSrcRef.current === videoSrc) return;
          kickedSrcRef.current = videoSrc;
          seek(0);
        }}
      />
      <div ref={lighterHostRef} className={styles.lighterHost} />
    </div>
  );
};
