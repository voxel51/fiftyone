import {
  PlaybackProvider,
  TIMELINE_DRAWER_MAX_SIZE,
  type TimelineMode,
} from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import {
  FrameLabelsTracks,
  RegisterFrameLabels,
  RegisterTimelineAudio,
  RegisterVideoExploreLabels,
  VideoLighterTile,
} from "@fiftyone/video-annotation";
import React, { useCallback, useMemo, useState } from "react";
import { VideoExploreToolbar } from "./VideoExploreToolbar";
import { useVideoExploreKeybindings } from "./useVideoExploreKeybindings";
import styles from "./VideoTimelineSurface.module.css";

/**
 * The readiness signal the lookers raise once a sample has painted: an
 * attribute to poll and a bubbling event of the same name to await. Named
 * for the canvas the lookers draw into, and kept verbatim here so nothing
 * watching for a sample to land has to know which surface rendered it.
 */
const LOADED = "canvas-loaded";

/**
 * Query-param escape hatch, read once at mount.
 *
 * On by default: the timeline is the direction of travel for video Explore.
 * It is not yet at parity with the looker it replaces, so `?mmtimeline=0`
 * falls back to `VideoLookerReact` for the behaviours still being ported —
 * and gives the e2e specs that cover them somewhere to run in the meantime.
 *
 * The app router preserves unknown query params (`useWriters/onSetSample.ts`
 * only rewrites `id`/`groupId`), so the opt-out survives opening the modal
 * and navigating between samples.
 */
export function useIsVideoTimelineEnabled(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return true;
    return (
      new URLSearchParams(window.location.search).get("mmtimeline") !== "0"
    );
  }, []);
}

/**
 * Fraction of the surface height the timeline may occupy before its body caps
 * and scrolls internally — so a growing track list never crowds out the media.
 * Mirrors the annotation surface so both video surfaces dock the same way.
 */
const TIMELINE_MAX_HEIGHT_FRACTION = 0.25;

/** Floor for the timeline body cap so it stays usable on a short surface. */
const TIMELINE_MIN_MAX_SIZE = 160;

/**
 * The media half of the surface: `VideoLighterTile` — the same Lighter-backed
 * tile the annotation surface uses — in its read-only `explore` mode.
 *
 * The tile owns the `<video>`, the engine binding (`useVideoStream` /
 * `useVideoSync` / `useVfcClockSource`) and the Lighter scene that paints the
 * label overlays and feeds the hover tooltip. What stays here is what is
 * specific to Explore: the readiness marker every sample surface publishes,
 * and the media-error fallback.
 */
const VideoTile: React.FC<{ videoSrc: string; filepath: string }> = ({
  videoSrc,
  filepath,
}) => {
  // Keyed to the source rather than a bare flag so navigating to a sample
  // that does load clears it without an effect and without a flicker.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const onLoadStart = useCallback((element: HTMLVideoElement) => {
    // The element is reused across sources, so the previous source's
    // marker has to come down before the next one lands. `loadstart`
    // is the element's own ordering guarantee that it precedes the
    // matching `loadeddata`, which a React effect would not be.
    element.removeAttribute(LOADED);
  }, []);

  const onLoadedData = useCallback(
    (element: HTMLVideoElement) => {
      element.setAttribute(LOADED, "true");
      element.dispatchEvent(
        new CustomEvent(LOADED, {
          detail: { sampleFilepath: filepath },
          bubbles: true,
        }),
      );
    },
    [filepath],
  );

  const onError = useCallback(() => setFailedSrc(videoSrc), [videoSrc]);

  if (failedSrc === videoSrc) {
    return (
      <div className={styles.empty} data-cy="looker-error-info">
        This video failed to load. The file may not exist, or its type may be
        unsupported.
      </div>
    );
  }

  return (
    <VideoLighterTile
      videoSrc={videoSrc}
      mode="explore"
      onLoadStart={onLoadStart}
      onLoadedData={onLoadedData}
      onError={onError}
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

  // `+` / `-` zoom. The rest of this surface's keys are already registered
  // elsewhere — see the hook's doc comment.
  useVideoExploreKeybindings();

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

  // Sequence mode when the frame rate is known, so the engine steps whole
  // frames and the frame domain is available to switch into; elapsed seconds
  // if not. This is what retires the looker's "use frame number" preference
  // — the readout in the controls row switches between the two at a click.
  //
  // The DISPLAY still opens on timecode (`defaultDisplay` below): frames were
  // opt-in on the looker too, behind `UseFrameNumberOptionElement`.
  const mode = useMemo<TimelineMode>(
    () =>
      frameRate && Number.isFinite(frameRate) && frameRate > 0
        ? { kind: "sequence", fps: frameRate }
        : { kind: "duration" },
    [frameRate],
  );

  return (
    <PlaybackProvider mode={mode} defaultDisplay="duration">
      {/* Hydrates the frame labels onto the tile's Lighter scene. A SIBLING
          of `RegisterFrameLabels`, not a child — that component swaps its
          wrapper when duration lands, which would remount the store. */}
      <RegisterVideoExploreLabels />
      {/* The timeline's audio stream — the only source of sound. The tile's
          <video> is muted ("pixels only"), so without this the surface is
          silent, which is what the looker's own volume control used to
          drive. `hasAudio` is left unset: there is no demuxer verdict on
          this path, so the element sniffs for a track itself. */}
      <RegisterTimelineAudio videoSrc={videoSrc} />
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
            <FrameLabelsTracks
              sample={sample}
              maxSize={timelineMaxSize}
              trailingActions={<VideoExploreToolbar />}
            />
          </div>
        </div>
      </RegisterFrameLabels>
    </PlaybackProvider>
  );
};
