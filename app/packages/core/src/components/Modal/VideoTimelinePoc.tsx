import {
  PlaybackProvider,
  TimelineWithTracks,
  TrackProvider,
  usePlayback,
  useVideoStream,
  useVideoSync,
  type TimelineMode,
  type Track,
} from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import {
  buildTemporalDetectionTracks,
  useVfcClockSource,
} from "@fiftyone/video-annotation";
import React, { useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";

/**
 * POC: the shared timeline under a single video sample in the modal's
 * Explore mode — the surface `VideoLookerReact` renders today.
 *
 * Video datasets are uni-modal, so this deliberately does NOT use the
 * multimodal shell: no tiling, no header, no sidebars. Just the player
 * with the timeline beneath it. `@fiftyone/playback` and
 * `@fiftyone/tiling` carry no multimodal dependency — only
 * `MultiModalPlayback` (in packages/multimodal) is the multimodal-branded
 * composition, and it isn't used here.
 *
 * Tiling belongs to the *group* case, which this file does not cover:
 * there, the same timeline gains a mosaic with one tile per selected
 * video slice, all driven by this same clock.
 *
 * Reached with `?mmtimeline=1` on a video sample. Not flagged, not a
 * shipping path — this exists to make the target concrete and clickable.
 */

const VIDEO_STREAM_ID = "video";

/** Query-param opt-in, read once at mount. */
export function useIsVideoTimelinePoc(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mmtimeline") === "1";
  }, []);
}

/**
 * `<video>` bound to the playback engine.
 *
 * Video-anchored playback: `useVfcClockSource` makes the decoder's
 * presented-frame time the engine's clock, so the engine commits exactly
 * where the picture is. The stream is therefore non-blocking — gating the
 * engine again on `bufferState` would double-count and cause stalls.
 *
 * Deliberately plain: no Lighter, no overlays, and none of the hover
 * overlay cluster (zoom / crop / toggle-overlays) that the button audit
 * assigns to this region. Those are the next step, not this one.
 */
const PocVideo: React.FC<{ videoSrc: string }> = ({ videoSrc }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const kickedRef = useRef(false);
  const { seek } = usePlayback();

  useVideoStream(VIDEO_STREAM_ID, videoRef, { blocking: false });
  useVideoSync(videoRef);
  useVfcClockSource(videoRef);

  return (
    <video
      ref={videoRef}
      src={videoSrc}
      preload="auto"
      playsInline
      muted
      style={{
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
      }}
      onLoadedData={() => {
        // The engine's RAF loop is dormant while paused, so nothing commits
        // until something moves the playhead. Kick it once so the first
        // frame and the ruler agree on mount.
        if (kickedRef.current) return;
        kickedRef.current = true;
        seek(0);
      }}
    />
  );
};

export const VideoTimelinePoc: React.FC<{ sample: fos.ModalSample }> = ({
  sample,
}) => {
  const colorScheme = useRecoilValue(fos.colorScheme);

  const videoSrc = useMemo(() => {
    const url = sample.urls?.[0]?.url;
    return url ? fos.getSampleSrc(url) : null;
  }, [sample]);

  // `frameRate` rides along on the modal sample but isn't on the type —
  // the same targeted cast video-annotation's `getModalSampleFrameRate` uses.
  const frameRate = (sample as { frameRate?: number }).frameRate;

  // Frame-numbered ruler when the frame rate is known; elapsed seconds if
  // not. This is what retires the looker's "use frame number" preference.
  const mode = useMemo<TimelineMode>(
    () =>
      frameRate && Number.isFinite(frameRate) && frameRate > 0
        ? { kind: "sequence", fps: frameRate }
        : { kind: "duration" },
    [frameRate],
  );

  // Temporal detections -> timeline tracks, via the same pure builder the
  // annotate surface uses. Frame-level labels (frames.detections) need
  // buildPerInstanceTracks and the annotation engine — not wired here, so a
  // stock quickstart-video shows the timeline with no track rows.
  const tracks = useMemo<Track[]>(() => {
    if (!frameRate) return [];
    return buildTemporalDetectionTracks({
      sample: sample.sample as unknown as Record<string, unknown>,
      fps: frameRate,
      resolveColor: () => colorScheme.colorPool[0] ?? "#ff6d04",
    });
  }, [sample, frameRate, colorScheme]);

  if (!videoSrc) {
    return <div style={{ padding: 16 }}>No media URL on this sample.</div>;
  }

  return (
    <PlaybackProvider mode={mode}>
      <TrackProvider tracks={tracks} autoPinNewTracks={false}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <PocVideo videoSrc={videoSrc} />
          </div>
          <TimelineWithTracks loaded defaultDrawerOpen={tracks.length > 0} />
        </div>
      </TrackProvider>
    </PlaybackProvider>
  );
};
