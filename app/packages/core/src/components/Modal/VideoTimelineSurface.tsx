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
  LighterVideo,
  getModalSampleFrameRate,
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
 * Fraction of the surface height the timeline may occupy before its body caps
 * and scrolls internally — so a growing track list never crowds out the media.
 * Mirrors the annotation surface so both video surfaces dock the same way.
 */
const TIMELINE_MAX_HEIGHT_FRACTION = 0.25;

/** Floor for the timeline body cap so it stays usable on a short surface. */
const TIMELINE_MIN_MAX_SIZE = 160;

/**
 * The media half of the surface: `LighterVideo` — the same Lighter-backed
 * player the annotation surface uses — in its read-only `explore` mode.
 *
 * It owns the `<video>`, the engine binding (`useVideoStream` /
 * `useVideoSync` / `useVfcClockSource`) and the Lighter scene that paints the
 * label overlays and feeds the hover tooltip. What stays here is what is
 * specific to Explore: the readiness marker every sample surface publishes,
 * and the media-error fallback.
 */
const ExploreVideo: React.FC<{
  videoSrc: string;
  filepath: string;
  onError: () => void;
}> = ({ videoSrc, filepath, onError }) => {
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

  return (
    <LighterVideo
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
  /**
   * The selected media field's resolved URL (`resolveMediaFieldLooker`'s
   * `selectedMediaPath`) — an alternate video field otherwise renders
   * whichever URL happens to be first in `sample.urls`.
   */
  videoPath: string | null | undefined;
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
  videoPath,
}) => {
  const videoSrc = useMemo(() => {
    const url = videoPath ?? sample.urls?.[0]?.url;
    return url ? fos.getSampleSrc(url) : null;
  }, [sample, videoPath]);

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

  // Owned here rather than inside `LighterVideo`: a media error unmounts it,
  // and with it the <video> that is this surface's only clock source. Left
  // nested, the timeline, its transport and the audio registrar would stay
  // mounted around a clock that can never tick. Keyed to the source rather
  // than a bare flag so navigating to a sample that does load clears it
  // without an effect and without a flicker.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const onMediaError = useCallback(() => setFailedSrc(videoSrc), [videoSrc]);
  const mediaFailed = !!videoSrc && failedSrc === videoSrc;

  // `frameRate` rides along on the modal sample but isn't on `ModalSample`'s
  // type, so it is read through the shared narrowing accessor rather than
  // re-cast here — `RegisterFrameLabels` gates on the same value.
  const frameRate = getModalSampleFrameRate(sample);

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

  // `PlaybackProvider` only resolves `mode` at mount — a later prop change
  // without a remount would leave the engine's clock domain and fallback
  // `stepInterval` on the first sample's mode. Keying on the resolved mode
  // (kind + fps) forces the remount switching samples needs while staying
  // stable across renders that don't change it.
  const playbackKey =
    mode.kind === "sequence" ? `sequence:${mode.fps}` : mode.kind;

  return (
    <PlaybackProvider key={playbackKey} mode={mode} defaultDisplay="duration">
      {/* Hydrates the frame labels onto the video's Lighter scene. A SIBLING
          of `RegisterFrameLabels`, not a child — that component swaps its
          wrapper when duration lands, which would remount the store. */}
      <RegisterVideoExploreLabels />
      {/* The timeline's audio stream — the only source of sound. The player's
          <video> is muted ("pixels only"), so without this the surface is
          silent, which is what the looker's own volume control used to
          drive. `hasAudio` is left unset: there is no demuxer verdict on
          this path, so the element sniffs for a track itself. */}
      <RegisterTimelineAudio videoSrc={videoSrc} />
      {/* Registers the /frames-backed label stream. A SIBLING for the same
          reason as the two above, and a load-bearing one: it gates on
          `useDuration() > 0` and re-keys on the resolved `frameCount`, while
          the duration it waits for is published by the <video> below. Nested, every sample would load, flip the gate, and then tear
          down and rebuild the very element that fed it — a visible reload, and
          a `canvas-loaded` marker that goes true, disappears, then true again.
          Consumers read the stream via `useFrameLabelsStream`, not position. */}
      <RegisterFrameLabels sample={sample} />
      <div
        ref={dimensions.ref as React.RefObject<HTMLDivElement>}
        data-cy="modal-looker-container"
        className={styles.root}
      >
        {/* The media area answers to `looker` the way every other sample
            surface does: it is what hover affordances target, and it
            survives a media error the same way the lookers' root does. */}
        <div className={styles.media} data-cy="looker">
          {!videoSrc ? (
            <div className={styles.empty}>No media URL on this sample.</div>
          ) : mediaFailed ? (
            <div className={styles.empty} data-cy="looker-error-info">
              This video failed to load. The file may not exist, or its type may
              be unsupported.
            </div>
          ) : (
            <ExploreVideo
              videoSrc={videoSrc}
              filepath={sample.sample.filepath}
              onError={onMediaError}
            />
          )}
        </div>
        {/* Owns its own TrackProvider + TimelineWithTracks. Track data is
            the server label index; the annotation engine contributes only
            an unsaved-edit overlay, empty in Explore. Dropped when the media
            failed: there is no clock to drive it, so it would only ever
            render an empty, inert transport under the error. */}
        {!mediaFailed && (
          <div className={styles.timeline}>
            <FrameLabelsTracks
              sample={sample}
              maxSize={timelineMaxSize}
              trailingActions={<VideoExploreToolbar />}
            />
          </div>
        )}
      </div>
    </PlaybackProvider>
  );
};
