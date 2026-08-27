import {
  PlaybackProvider,
  TIMELINE_DRAWER_MAX_SIZE,
  usePlayback,
  useVideoStream,
  useVideoSync,
  type TimelineMode,
} from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import {
  FrameLabelsTracks,
  RegisterFrameLabels,
  useVfcClockSource,
} from "@fiftyone/video-annotation";
import React, { useMemo, useRef, useState } from "react";
import styles from "./VideoTimelineSurface.module.css";

const VIDEO_STREAM_ID = "video";

/**
 * The readiness signal the lookers raise once a sample has painted: an
 * attribute to poll and a bubbling event of the same name to await. Named
 * for the canvas the lookers draw into, and kept verbatim here so nothing
 * watching for a sample to land has to know which surface rendered it.
 */
const LOADED = "canvas-loaded";

/**
 * Fraction of the surface height the timeline may occupy before its body caps
 * and scrolls internally — so a growing track list never crowds out the media.
 * Mirrors the annotation surface so both video surfaces dock the same way.
 */
const TIMELINE_MAX_HEIGHT_FRACTION = 0.25;

/** Floor for the timeline body cap so it stays usable on a short surface. */
const TIMELINE_MIN_MAX_SIZE = 160;

/**
 * `<video>` bound to the playback engine.
 *
 * Video-anchored playback: `useVfcClockSource` makes the decoder's
 * presented-frame time the engine's clock, so the engine commits exactly
 * where the picture is. The stream is therefore non-blocking — gating the
 * engine again on `bufferState` would double-count and cause stalls.
 *
 * Deliberately plain: no Lighter and no overlays. The hover overlay cluster
 * (zoom / crop / toggle-overlays) is tracked separately.
 */
const VideoTile: React.FC<{ videoSrc: string; filepath: string }> = ({
  videoSrc,
  filepath,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { seek } = usePlayback();
  // Keyed to the source rather than a bare flag so navigating to a sample
  // that does load clears it without an effect and without a flicker.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Which `videoSrc` the engine has already been kicked for. `loadeddata`
  // can fire more than once on the same element — a `currentTime` write
  // across an unbuffered range drops readyState below HAVE_CURRENT_DATA and
  // fires it again on recovery — and an unguarded kick would yank the
  // playhead back to 0 mid-session.
  const kickedSrcRef = useRef<string | null>(null);

  useVideoStream(VIDEO_STREAM_ID, videoRef, { blocking: false });
  useVideoSync(videoRef);
  useVfcClockSource(videoRef);

  if (failedSrc === videoSrc) {
    return (
      <div className={styles.empty} data-cy="looker-error-info">
        This video failed to load. The file may not exist, or its type may be
        unsupported.
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className={styles.video}
      src={videoSrc}
      preload="auto"
      playsInline
      muted
      onLoadStart={() => {
        // The element is reused across sources, so the previous source's
        // marker has to come down before the next one lands. `loadstart`
        // is the element's own ordering guarantee that it precedes the
        // matching `loadeddata`, which a React effect would not be.
        videoRef.current?.removeAttribute(LOADED);
      }}
      onError={() => setFailedSrc(videoSrc)}
      onLoadedData={() => {
        const element = videoRef.current;
        element?.setAttribute(LOADED, "true");
        element?.dispatchEvent(
          new CustomEvent(LOADED, {
            detail: { sampleFilepath: filepath },
            bubbles: true,
          }),
        );

        // The engine's RAF loop is dormant while paused, so nothing commits
        // until something moves the playhead. Kick it once per source so the
        // first frame and the ruler agree on mount.
        if (kickedSrcRef.current === videoSrc) return;
        kickedSrcRef.current = videoSrc;
        seek(0);
      }}
    />
  );
};

export interface VideoTimelineSurfaceProps {
  sample: fos.ModalSample;
}

/**
 * The video sample surface in the modal's Explore mode: the player with the
 * shared timeline docked beneath it.
 *
 * Video datasets are uni-modal, so this deliberately does NOT use the
 * multimodal shell: no tiling, no header, no sidebars. `@fiftyone/playback`
 * carries no multimodal dependency — `MultiModalPlayback` (in
 * `packages/multimodal`) is the multimodal-branded composition, and it isn't
 * used here.
 *
 * Tiling belongs to the *group* case, which this file does not cover: there,
 * the same timeline gains a mosaic with one tile per selected video slice,
 * all driven by this same clock.
 */
export const VideoTimelineSurface: React.FC<VideoTimelineSurfaceProps> = ({
  sample,
}) => {
  const videoSrc = useMemo(() => {
    const url = sample.urls?.[0]?.url;
    return url ? fos.getSampleSrc(url) : null;
  }, [sample]);

  // Measure the surface so the timeline body caps at a fraction of it: past
  // the cap the drawer scrolls internally instead of growing into the media.
  const dimensions = fos.useDimensions();
  const surfaceHeight = dimensions.bounds?.height ?? 0;
  const timelineMaxSize = surfaceHeight
    ? Math.min(
        TIMELINE_DRAWER_MAX_SIZE,
        Math.max(
          TIMELINE_MIN_MAX_SIZE,
          Math.round(surfaceHeight * TIMELINE_MAX_HEIGHT_FRACTION),
        ),
      )
    : undefined;

  // `frameRate` rides along on the modal sample but isn't on the type —
  // the same targeted cast video-annotation's `getModalSampleFrameRate` uses.
  const frameRate = (sample as { frameRate?: number }).frameRate;

  // Frame-numbered ruler when the frame rate is known; elapsed seconds if
  // not. This is what retires the looker's "use frame number" preference —
  // the readout in the controls row switches between the two at a click.
  const mode = useMemo<TimelineMode>(
    () =>
      frameRate && Number.isFinite(frameRate) && frameRate > 0
        ? { kind: "sequence", fps: frameRate }
        : { kind: "duration" },
    [frameRate],
  );

  return (
    <PlaybackProvider mode={mode}>
      {/* Registers the /frames-backed label stream. It gates on
          `useDuration() > 0`, so it must sit inside the provider and
          outside anything that would remount when duration lands. */}
      <RegisterFrameLabels sample={sample}>
        <div
          ref={dimensions.ref as React.RefObject<HTMLDivElement>}
          data-cy="modal-looker-container"
          className={styles.root}
        >
          {/* The media area answers to `looker` the way every other sample
              surface does: it is what hover affordances target, and it
              survives a media error the same way the lookers' root does. */}
          <div className={styles.media} data-cy="looker">
            {videoSrc ? (
              <VideoTile
                videoSrc={videoSrc}
                filepath={sample.sample.filepath}
              />
            ) : (
              <div className={styles.empty}>No media URL on this sample.</div>
            )}
          </div>
          {/* Owns its own TrackProvider + TimelineWithTracks. Track data is
              the server label index; the annotation engine contributes only
              an unsaved-edit overlay, empty in Explore. */}
          <div className={styles.timeline}>
            <FrameLabelsTracks sample={sample} maxSize={timelineMaxSize} />
          </div>
        </div>
      </RegisterFrameLabels>
    </PlaybackProvider>
  );
};
