import { getLabelColorFromContext } from "@fiftyone/lighter";
import {
  colorScheme,
  colorSeed,
  datasetName,
  groupSlice,
  modalSampleId,
  view as viewAtom,
} from "@fiftyone/state";
import type { ModalSample } from "@fiftyone/state";
import type { Stage } from "@fiftyone/utilities";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";
import { usePlayback } from "../../playback/src/lib/playback/PlaybackProvider";
import { useDuration } from "../../playback/src/lib/playback/use-playback-state";
import { usePlaybackStream } from "../../playback/src/lib/playback/use-playback-stream";
import {
  TrackProvider,
  type Track,
} from "../../playback/src/lib/tracks/TrackProvider";
import TimelineWithTracks from "../../playback/src/views/TimelineWithTracks/TimelineWithTracks";
import { FrameLabelsContext, useFrameLabelsStream } from "./FrameLabelsContext";
import { buildPerInstanceTracks, type PerInstanceLabel } from "./frameTracks";
import { LABELS_STREAM_ID } from "./ids";
import { useLinkedTrackDecorator } from "./linkedTracks";
import {
  buildTemporalDetectionTracks,
  type TemporalDetectionEventData,
  type TemporalDetectionLabelLike,
} from "./temporalDetectionTracks";
import { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

// todo - hardcoded for demo
export const FRAME_FIELD = "frames.detections";

/**
 * Reads the params needed to construct a real `/frames`-backed labels
 * stream from recoil + the modal sample, waits until duration is known
 * (so we can derive `frameCount`), then mounts the registration child
 * with a key that changes if the underlying sample / view changes — so
 * a fresh stream cleanly replaces the old one through usePlaybackStream's
 * standard lifecycle.
 *
 * Wraps its children in a `FrameLabelsContext.Provider` so downstream
 * consumers (e.g. {@link FrameLabelsTracks}) can read the same stream
 * without issuing duplicate fetches.
 */
export const RegisterFrameLabels: React.FC<{
  sample: ModalSample;
  children: React.ReactNode;
}> = ({ sample, children }) => {
  const duration = useDuration();
  const dataset = useRecoilValue(datasetName);
  const view = useRecoilValue(viewAtom);
  const slice = useRecoilValue(groupSlice);
  const sampleId = useRecoilValue(modalSampleId);

  const frameRate = sample.frameRate;
  const ready =
    duration > 0 && !!sampleId && !!dataset && Number.isFinite(frameRate);

  if (!ready) {
    // Stream params aren't all available yet; expose a null stream so
    // consumers render their loading/placeholder state.
    return (
      <FrameLabelsContext.Provider value={null}>
        {children}
      </FrameLabelsContext.Provider>
    );
  }

  const frameCount = Math.max(1, Math.round(duration * frameRate));

  // Include every input that affects the stream's identity in the key so
  // changing sample / view re-mounts the registrar with a fresh stream
  // and `usePlaybackStream`'s effect cleanup unregisters the old one.
  const key = `${sampleId}|${dataset}|${
    slice ?? ""
  }|${frameRate}|${frameCount}`;

  return (
    <FrameLabelsRegistration
      key={key}
      sampleId={sampleId}
      dataset={dataset}
      view={view ?? []}
      groupSlice={slice ?? null}
      frameCount={frameCount}
      frameRate={frameRate}
    >
      {children}
    </FrameLabelsRegistration>
  );
};

interface FrameLabelsRegistrationProps {
  sampleId: string;
  dataset: string;
  view: Stage[];
  groupSlice: string | null;
  frameCount: number;
  frameRate: number;
  children: React.ReactNode;
}

const FrameLabelsRegistration: React.FC<FrameLabelsRegistrationProps> = ({
  children,
  ...props
}) => {
  // Construct once per mount — the parent re-mounts us on identity
  // changes via `key`.
  const streamRef = useRef<VideoFrameLabelsStream | null>(null);
  if (streamRef.current === null) {
    streamRef.current = new VideoFrameLabelsStream({
      id: LABELS_STREAM_ID,
      sampleId: props.sampleId,
      dataset: props.dataset,
      view: props.view,
      groupSlice: props.groupSlice,
      frameCount: props.frameCount,
      frameRate: props.frameRate,
    });
  }
  usePlaybackStream(streamRef.current);

  // Prefetch the chunk containing t=0 and then seek(0). The engine's
  // `seek` only commits when every blocking stream is already ready, so
  // without the warmup the engine queues the seek silently and overlays
  // stay blank until the user presses play. With it, overlays paint as
  // soon as the first chunk lands.
  const { seek } = usePlayback();
  useEffect(() => {
    let cancelled = false;
    void streamRef.current!.warmup(0).then(() => {
      if (!cancelled) seek(0);
    });
    return () => {
      cancelled = true;
    };
  }, [seek]);

  return (
    <FrameLabelsContext.Provider value={streamRef.current}>
      {children}
    </FrameLabelsContext.Provider>
  );
};

/**
 * Labels track timeline — one row per tracked instance observed in
 * the clip (grouped by `index`), plus one row per `TemporalDetection`
 * on the sample (rendered as an interval spanning `support`). Untracked
 * labels still paint as overlays but don't get rows. Triggers a one-shot
 * `warmupAll` so the cache covers every frame, then walks it to build
 * the frame-derived tracks; TD tracks are derived synchronously from
 * the sample dict and merged in.
 *
 * Rebuilds (and re-broadcasts through `TrackProvider`) whenever the
 * color scheme or seed changes so row colors stay in lock-step with the
 * overlays — `getLabelColorFromContext` returns different colors under
 * the same input when the palette, seed, or `colorBy` mode changes.
 *
 * One-shot re-key on the empty→ready transition so `initialPinnedIds`
 * (which the provider only reads at mount) bootstraps from the real
 * track list. Subsequent recolors update through the live `tracks`
 * prop and don't trip the key, so the user's pin state is preserved.
 */
export const FrameLabelsTracks: React.FC<{ sample?: ModalSample }> = ({
  sample,
}) => {
  const stream = useFrameLabelsStream();
  const scheme = useRecoilValue(colorScheme);
  const seed = useRecoilValue(colorSeed);

  // useState so we can re-render once warmupAll resolves, but keep the
  // build deterministic in the deps (stream identity changes when the
  // sample changes, which is the trigger we care about).
  const [frameTracks, setFrameTracks] = useState<Track[]>([]);

  const resolveColor = useCallback(
    (label: PerInstanceLabel) =>
      getLabelColorFromContext(FRAME_FIELD, label, {
        colorScheme: scheme,
        seed,
      }),
    [scheme, seed]
  );

  const resolveTemporalDetectionColor = useCallback(
    (path: string, label: TemporalDetectionLabelLike) =>
      getLabelColorFromContext(path, label, {
        colorScheme: scheme,
        seed,
      }),
    [scheme, seed]
  );

  useEffect(() => {
    if (!stream) {
      setFrameTracks([]);
      return;
    }

    let cancelled = false;

    void stream.warmupAll().then(() => {
      if (cancelled) {
        return;
      }

      setFrameTracks(buildPerInstanceTracks({ stream, resolveColor }));
    });

    return () => {
      cancelled = true;
    };
  }, [stream, resolveColor]);

  const temporalDetectionTracks = useMemo(() => {
    if (!sample?.sample) {
      return [];
    }
    // `sample.frameRate` is the canonical fps for the clip; same source
    // `RegisterFrameLabels` consumes for the labels-stream constructor.
    const fps = sample.frameRate;
    if (!Number.isFinite(fps) || fps <= 0) {
      return [];
    }
    return buildTemporalDetectionTracks({
      sample: sample.sample as Record<string, unknown>,
      fps,
      resolveColor: resolveTemporalDetectionColor,
    });
  }, [sample, resolveTemporalDetectionColor]);

  const tracks = useMemo(
    () => [...frameTracks, ...temporalDetectionTracks],
    [frameTracks, temporalDetectionTracks]
  );
  const pinned = useMemo(() => tracks.map((t) => t.id), [tracks]);
  const ready = tracks.length > 0;
  const linkDecorate = useLinkedTrackDecorator();
  const fps = sample?.frameRate;
  const snapStepSec =
    Number.isFinite(fps) && fps && fps > 0 ? 1 / fps : undefined;

  // Compose: keep the linked-overlay wiring (hover / select / scroll)
  // and layer TD-specific resize wiring on top for TD rows. TD rows
  // have no Lighter overlay, so the linked-overlay calls are no-ops on
  // them — they don't break, just don't do anything visible.
  const decorateTrack = useCallback(
    (track: Track) => {
      const base = linkDecorate(track);
      const tdEvent = track.events[0]?.data as
        | TemporalDetectionEventData
        | undefined;
      const isTemporalDetection =
        track.id.startsWith("td-") && tdEvent !== undefined;

      if (!isTemporalDetection || !fps) {
        return base;
      }

      return {
        ...base,
        snapStepSec,
        onEventResize: (
          _eventIndex: number,
          newStartSec: number,
          newEndSec: number
        ) => {
          // Convert seconds back to 1-indexed inclusive frame numbers
          // using the same mapping the build does in reverse:
          //   startSec = (firstFrame - 1) / fps  ⇒  firstFrame = round(startSec * fps) + 1
          //   endSec   = lastFrame / fps         ⇒  lastFrame  = round(endSec * fps)
          const firstFrame = Math.max(1, Math.round(newStartSec * fps) + 1);
          const lastFrame = Math.max(firstFrame, Math.round(newEndSec * fps));

          // TODO: route through the command bus for undo/redo
          console.log("[TODO undo/redo] TemporalDetection support edit", {
            fieldPath: tdEvent.fieldPath,
            detectionId: tdEvent.detectionId,
            previousSupport: tdEvent.support,
            newSupport: [firstFrame, lastFrame],
          });
        },
      };
    },
    [linkDecorate, fps, snapStepSec]
  );

  return (
    <TrackProvider
      key={ready ? "ready" : "init"}
      tracks={tracks}
      initialPinnedIds={pinned}
    >
      <TimelineWithTracks decorateTrack={decorateTrack} />
    </TrackProvider>
  );
};
