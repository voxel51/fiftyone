import React, { type RefObject, useRef, useState } from "react";
import {
  usePlayback,
  usePublishCurrentFrame,
  useVideoStream,
  useVideoSync,
} from "@fiftyone/playback";
import { useLighterSelectionBridge } from "../../../core/src/components/Modal/Lighter/useLighterSelectionEventHandler";
import { useLighterTooltipEventHandler } from "../../../core/src/components/Modal/Lighter/useLighterTooltipEventHandler";
import { useLighterMediaScene } from "../hooks/useLighterMediaScene";
import { useCurrentFrame } from "../state/useCurrentFrame";
import { useVfcClockSource } from "../hooks/useVfcClockSource";
import { useVideoAnnotationSyncBundle } from "../hooks/useVideoAnnotationSyncBundle";
import { useVideoExploreSyncBundle } from "../hooks/useVideoExploreSyncBundle";
import { VIDEO_STREAM_ID } from "../utils/ids";
import styles from "./LighterVideo.module.css";

/** Which sync bundle this arms. Explore is the read-only half. */
export type LighterVideoMode = "annotate" | "explore";

interface SyncProps {
  scene: ReturnType<typeof useLighterMediaScene>["scene"];
  canonicalMediaReady: boolean;
  mediaRef: RefObject<HTMLVideoElement | null>;
}

/**
 * Null-rendering hosts for the two sync bundles. Which bundle runs is a
 * per-surface choice, and hooks cannot be called conditionally — so the
 * choice becomes which component is rendered, and each one's hooks
 * stay unconditional inside it.
 */
const AnnotateSync: React.FC<SyncProps> = (props) => {
  useVideoAnnotationSyncBundle(props);
  return null;
};

const ExploreSync: React.FC<SyncProps> = (props) => {
  useVideoExploreSyncBundle(props);
  return null;
};

export interface LighterVideoProps {
  /** Resolved media URL for the video. */
  videoSrc: string;
  /**
   * Which sync bundle to arm. Defaults to `annotate` so the annotation
   * surface keeps its existing behavior; Explore passes `explore` for the
   * read-only overlay path.
   */
  mode?: LighterVideoMode;
  /**
   * Media lifecycle passthroughs, fired alongside this component's own handling
   * rather than replacing it. Explore uses them to raise the readiness
   * marker every sample surface publishes and to fall back on a load
   * failure; this component itself stays agnostic to both.
   */
  onLoadStart?: (element: HTMLVideoElement) => void;
  onLoadedData?: (element: HTMLVideoElement) => void;
  onError?: (element: HTMLVideoElement) => void;
}

/**
 * <video> bound to the playback engine, Lighter overlaid on top,
 * Overlays diffed in from the labels stream each commit.
 */
export const LighterVideo: React.FC<LighterVideoProps> = ({
  videoSrc,
  mode = "annotate",
  onLoadStart,
  onLoadedData,
  onError,
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

  // Bind <video> -> playback engine. The video-annotation surface uses
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

  // Publish the playhead frame for the consumers that sit OUTSIDE this
  // provider and so cannot convert playhead seconds themselves: the modal's
  // action bar is a sibling of the media container, and both the label
  // selection and "Select visible labels (current frame)" have to agree with
  // the canvas about which frame is current.
  usePublishCurrentFrame(useCurrentFrame());

  // Scene lifecycle (singleton canvas, pixi setup, color scheme, canonical
  // media, viewport fit). A fresh scene per `videoSrc` so a new source video
  // gets its own scene; `dims` from the <video>'s intrinsic resolution.
  const { scene, canonicalMediaReady } = useLighterMediaScene({
    hostRef: lighterHostRef,
    dims: videoDims,
    sceneIdPrefix: "video-anno",
    sceneIdDeps: [videoSrc],
    // Explore renders labels it cannot save — lock geometry so a stray drag
    // can't commit a silent edit. Selection and hover still work.
    readOnly: mode === "explore",
    // ...and in Explore selecting labels is the whole point of clicking one:
    // the selection feeds the modal's Tag and "Manage selected" actions, which
    // act on any number of labels at once. Annotate stays single-select — a
    // selection there is the target of the next edit.
    multipleSelection: mode === "explore",
  });

  // Hover -> `fos.tooltipDetail`, which `TooltipInfo` (mounted in Modal.tsx)
  // renders. Explore only: this replaces the tooltip the video looker drew, so
  // Explore is where it is a restoration. Annotate never had one, and popping
  // a tooltip over the canvas mid-draw is a product change in its own right —
  // `null` routes the hook at the undefined channel, so it observes nothing.
  useLighterTooltipEventHandler(mode === "explore" ? scene : null);

  // Canvas selection <-> `fos.selectedLabels`, which the modal's Tag and
  // "Manage selected" actions read. Both directions: a click writes the atom,
  // and the atom writes the canvas back when something else changes it (the
  // "Manage selected" menu, a successful tag, hiding labels, an operator).
  //
  // Explore only, and routed at the undefined channel otherwise: in Annotate a
  // selection belongs to the annotation engine's active handles, and mirroring
  // it into this atom would make the label actions act on whatever the user is
  // mid-edit on.
  useLighterSelectionBridge(mode === "explore" ? scene : null);

  const Sync = mode === "annotate" ? AnnotateSync : ExploreSync;

  return (
    <div className={styles.body}>
      <video
        ref={videoRef}
        className={styles.video}
        src={videoSrc}
        preload="auto"
        playsInline
        // pixels only
        muted
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setVideoDims({ w: v.videoWidth, h: v.videoHeight });
        }}
        onLoadStart={(e) => onLoadStart?.(e.currentTarget)}
        onError={(e) => onError?.(e.currentTarget)}
        onLoadedData={(e) => {
          onLoadedData?.(e.currentTarget);

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
      {/* Overlay / sidebar sync. `videoRef` keeps the <video> zoomed and
          panned with the Lighter viewport so scroll-zoom scales the
          picture, not just the overlays. */}
      <Sync
        scene={scene}
        canonicalMediaReady={canonicalMediaReady}
        mediaRef={videoRef}
      />
    </div>
  );
};
