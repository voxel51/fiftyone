import { getSampleSrc, useDimensions } from "@fiftyone/state";
import type { ModalSample } from "@fiftyone/state";
import React, { useMemo, useState } from "react";
import { useAutoInterpolate } from "../hooks/useAutoInterpolate";
import { useEndPointSessionOnFrameChange } from "../hooks/useEndPointSessionOnFrameChange";
import { useRegisterVideoAnnotationKeybindings } from "../hooks/useRegisterVideoAnnotationKeybindings";
import { useRegisterVideoSegmentBitmap } from "../hooks/useRegisterVideoSegmentBitmap";
import { useSyncAnnotationFrameClock } from "../hooks/useSyncAnnotationFrameClock";
import { useSyncAnnotationVideoStore } from "../hooks/useSyncAnnotationVideoStore";
import { useVideoLighterEngineBridge } from "../hooks/useVideoLighterEngineBridge";
import { useFollowAnchorFrame } from "../state/useVideoInteraction";
import { useAnnotatePrerequisites } from "../hooks/useAnnotatePrerequisites";
import { useDecodeStrategy } from "../hooks/useDecodeStrategy";
import type { DecodeStrategy } from "../utils/decodeStrategy";
import { useTimelineMaxSize } from "../hooks/useTimelineMaxSize";
import { PlaybackProvider, type TimelineMode } from "@fiftyone/playback";
import {
  AnnotatePrerequisiteChecking,
  AnnotatePrerequisiteNotice,
} from "./AnnotatePrerequisiteNotice";
import { FrameLabelsTracks, RegisterFrameLabels } from "./FrameLabels";
import { ImaVidLighterTile } from "./ImaVidLighterTile";
import { RegisterImaVidImage } from "./RegisterImaVidImage";
import { RegisterTimelineAudio } from "./RegisterTimelineAudio";
import {
  RegisterSyntheticLabels,
  SyntheticTrackTimeline,
} from "./SyntheticLabels";
import { VideoAnnotationToolbar } from "./VideoAnnotationToolbar";
import { VideoAnnotationTopBar } from "./VideoAnnotationTopBar";
import { LighterVideo } from "./LighterVideo";
import styles from "./VideoAnnotationSurface.module.css";

/**
 * Switch between the synthetic stream (for testing the rendering path
 * without real labels) and the real `/frames`-backed stream.
 *
 * - default: real
 * - `?labels=synthetic`: synthetic
 *
 * Read once at mount; flipping requires reopening the modal.
 */
type LabelsMode = "real" | "synthetic";

function useLabelsMode(): LabelsMode {
  const [mode] = useState<LabelsMode>(() => {
    if (typeof window === "undefined") {
      return "real";
    }

    const param = new URLSearchParams(window.location.search).get("labels");
    return param === "synthetic" ? "synthetic" : "real";
  });

  return mode;
}

interface MediaProps {
  videoSrc: string | null;
  /** Demuxer verdict on audio-track presence; undefined = unknown. */
  hasAudio?: boolean;
}

interface RegistrarProps {
  frameCount: number;
  frameRate: number;
  videoSrc: string | null;
  children: React.ReactNode;
}

/**
 * The one place a resolved {@link DecodeStrategy} maps to a rendering path.
 * Add a strategy by adding a row here + a branch in `resolveDecodeStrategy`.
 *
 * `TILE` picks the media element; `REGISTRAR` wraps the surface with the stream
 * that drives the timeline's duration (`extract`/`fetch` register an ImaVid
 * frame stream; `html` registers nothing — the `<video>` element is its own
 * clock source).
 *
 * Audio follows the same split. The `html` tile's `<video>` already holds the
 * sound, so `LighterVideo` plays it from that element; only the ImaVid paths,
 * which have no media element of their own, mount a separate audio element
 * (see `AUDIO_ONLY_STRATEGIES` below).
 */
const STRATEGY_TILE: Record<DecodeStrategy, React.FC<MediaProps>> = {
  extract: () => <ImaVidLighterTile />,
  fetch: () => <ImaVidLighterTile />,
  html: ({ videoSrc, hasAudio }) =>
    videoSrc ? (
      <LighterVideo videoSrc={videoSrc} hasAudio={hasAudio} />
    ) : (
      <div className={styles.empty}>No media URL on this sample.</div>
    ),
};

/**
 * Strategies whose timeline needs its own `HTMLAudioElement`: the ImaVid
 * paths render decoded frames or per-frame images, so nothing on the surface
 * is playing the source container's audio track. The `html` tile is excluded
 * deliberately — a second element over the same URL there would fetch and
 * decode the whole video a second time for sound the `<video>` already has.
 */
const AUDIO_ONLY_STRATEGIES: ReadonlySet<DecodeStrategy> =
  new Set<DecodeStrategy>(["extract", "fetch"]);

const STRATEGY_REGISTRAR: Record<DecodeStrategy, React.FC<RegistrarProps>> = {
  extract: ({ children, ...props }) => (
    <RegisterImaVidImage source="extract" {...props}>
      {children}
    </RegisterImaVidImage>
  ),
  fetch: ({ children, ...props }) => (
    <RegisterImaVidImage source="fetch" {...props}>
      {children}
    </RegisterImaVidImage>
  ),
  html: ({ children }) => <>{children}</>,
};

export interface VideoAnnotationSurfaceProps {
  sample: ModalSample;
}

/**
 * Composition root for the video annotation surface. Wires
 * PlaybackProvider + TrackProvider + TilingProvider, registers a labels
 * stream (real `/frames` by default; synthetic when `?labels=synthetic`),
 * and renders media (top) + timeline (bottom).
 *
 * How frames are sourced is decided once by {@link useDecodeStrategy}
 * (`extract` | `fetch` | `html`) — resolved BEFORE the media scaffolding
 * mounts, so the timeline/sidebar mount exactly once.
 *
 * Lives inside the modal's media region — the existing right-side
 * annotation sidebar continues to render outside this component.
 */
export const VideoAnnotationSurface: React.FC<VideoAnnotationSurfaceProps> = ({
  sample,
}) => {
  const labelsMode = useLabelsMode();
  const prerequisites = useAnnotatePrerequisites(sample);

  // Measure the surface so the timeline body caps at a fraction of it: past the
  // cap the drawer scrolls internally instead of growing into the media area.
  const dimensions = useDimensions();
  const surfaceHeight = dimensions.bounds?.height ?? 0;
  const timelineMaxSize = useTimelineMaxSize(surfaceHeight);

  // Resolved top-level media URL. The `html` tile binds to it and the `extract`
  // source decodes it in a worker; the `fetch` source resolves per-frame URLs
  // instead and ignores it.
  const videoSrc = useMemo(() => {
    const url = sample.urls?.[0]?.url;
    return url ? getSampleSrc(url) : null;
  }, [sample]);

  // Sequence mode makes the frame domain available to switch into, which is
  // what turns the controls row's readout into a button (see `PlayheadTime`).
  // `useAnnotatePrerequisites` blocks the surface unless the frame rate is
  // finite and positive, so by the time this provider mounts there is always
  // one — no `duration` fallback, and no remount key: the gates below hold the
  // provider back until `frameRate` has resolved, so it never changes under it.
  //
  // The display still opens on timecode (`defaultDisplay` below); frames are
  // opt-in, matching Explore.
  const mode = useMemo<TimelineMode>(
    () => ({ kind: "sequence", fps: prerequisites.frameRate as number }),
    [prerequisites.frameRate],
  );

  // Decide the decode strategy up front. Runs unconditionally (before the gates
  // below) to keep hook order stable across the resolving → resolved transition.
  const resolution = useDecodeStrategy({
    videoSrc,
    frameCount: prerequisites.frameCount,
    enabled: prerequisites.status === "ready",
  });

  // Metadata gate: without a frame count no strategy can mount, so show an
  // actionable prompt instead of a stream that would throw or blank out.
  if (prerequisites.status === "blocked") {
    return (
      <div
        ref={dimensions.ref as React.RefObject<HTMLDivElement>}
        className={styles.root}
      >
        <VideoAnnotationTopBar sample={sample} />
        <div className={styles.media}>
          <AnnotatePrerequisiteNotice blocker={prerequisites.blocker} />
        </div>
      </div>
    );
  }

  // Strategy still resolving (a frames / native-decode probe is in flight):
  // hold on a spinner so the scaffolding mounts exactly once, on the winner.
  if (resolution.status !== "resolved" || !resolution.strategy) {
    return (
      <div
        ref={dimensions.ref as React.RefObject<HTMLDivElement>}
        className={styles.root}
      >
        <VideoAnnotationTopBar sample={sample} />
        <div className={styles.media}>
          <AnnotatePrerequisiteChecking />
        </div>
      </div>
    );
  }

  const strategy = resolution.strategy;
  const Tile = STRATEGY_TILE[strategy];
  const Registrar = STRATEGY_REGISTRAR[strategy];

  const layout = (
    <div
      ref={dimensions.ref as React.RefObject<HTMLDivElement>}
      className={styles.root}
    >
      <VideoAnnotationTopBar sample={sample} />
      <div className={styles.media}>
        <Tile videoSrc={videoSrc} hasAudio={resolution.hasAudio} />
      </div>
      <div className={styles.timeline}>
        {labelsMode === "synthetic" ? (
          <SyntheticTrackTimeline />
        ) : (
          <FrameLabelsTracks
            sample={sample}
            maxSize={timelineMaxSize}
            extraActions={<VideoAnnotationToolbar />}
          />
        )}
      </div>
    </div>
  );

  // Both registrars run against the same PlaybackProvider. In the ImaVid
  // (`extract`/`fetch`) path the image stream is the timeline's duration source
  // (analogous to `<video>` in the `html` tile), so it has to mount OUTSIDE the
  // labels registrar — `RegisterFrameLabels` gates on `useDuration() > 0` and
  // swaps its wrapper component when it flips ready, which would otherwise
  // remount whatever's nested inside it.
  const labels =
    labelsMode === "synthetic" ? (
      <>
        <RegisterSyntheticLabels />
        {layout}
      </>
    ) : (
      <RegisterFrameLabels sample={sample}>{layout}</RegisterFrameLabels>
    );

  const registered = (
    <Registrar
      frameCount={prerequisites.frameCount as number}
      frameRate={prerequisites.frameRate as number}
      videoSrc={videoSrc}
    >
      {labels}
    </Registrar>
  );

  // No TilingProvider: it mounts an isolated jotai store, which would
  // shadow modal-scoped atoms the sidebar writes to (lighterSceneAtom,
  // detection-mode, label list). Reintroducing multi-tile here requires
  // first pinning those atoms to the modal-default store explicitly.
  return (
    // Annotation wants the playhead to rest on a real frame after a pause or
    // scrub-drag, so the labels snapshot and any keyframe op align to a frame.
    // Scrubbing stays continuous — only the settle position snaps.
    <PlaybackProvider snapToFrameOnSettle mode={mode} defaultDisplay="duration">
      <VideoAnnotationHandlerRegistration />
      {AUDIO_ONLY_STRATEGIES.has(strategy) && (
        <RegisterTimelineAudio
          videoSrc={videoSrc}
          hasAudio={resolution.hasAudio}
        />
      )}
      {registered}
    </PlaybackProvider>
  );
};

/**
 * Mounts video-specific command + keybinding registrars inside the
 * surface's `<PlaybackProvider>` so they can read `useCurrentTime`.
 * The handlers no-op when there's no active selection or frame-labels
 * stream, so it's safe to render unconditionally.
 */
const VideoAnnotationHandlerRegistration: React.FC = () => {
  useSyncAnnotationFrameClock();
  useSyncAnnotationVideoStore();
  // after the clock + store: the bridge reconciles against the FrameTemporalView
  // and a seeded frame store, not the degenerate pool view
  useVideoLighterEngineBridge();
  useRegisterVideoAnnotationKeybindings();
  // expose the active ImaVid frame to the SAM2 agent for click-to-segment
  useRegisterVideoSegmentBitmap();
  // a point session belongs to the frame it started on; end it on a move
  useEndPointSessionOnFrameChange();
  useAutoInterpolate();
  // editing a frame label: keep the anchor (and the form) on the playhead's
  // occurrence of the same track as the playhead moves
  useFollowAnchorFrame();
  return null;
};
