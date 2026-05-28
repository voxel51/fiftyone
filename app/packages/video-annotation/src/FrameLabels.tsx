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
import { useActiveDetectionField } from "../../core/src/components/Modal/Sidebar/Annotate/Edit/useDetectionMode";
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
import {
  useFrameLabelsEditVersion,
  useFrameLabelsStream,
  usePublishFrameLabelsStream,
} from "./frameLabelsStream";
import { buildPerInstanceTracks, type PerInstanceLabel } from "./frameTracks";
import { LABELS_STREAM_ID } from "./ids";
import { useLinkedTrackDecorator } from "./linkedTracks";
import {
  applyTemporalDetectionEdits,
  useStageTemporalDetectionSupport,
  useTemporalDetectionPendingEdits,
} from "./pendingTemporalDetectionEdits";
import {
  buildTemporalDetectionTracks,
  type TemporalDetectionEventData,
  type TemporalDetectionLabelLike,
} from "./temporalDetectionTracks";
import { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

const DEFAULT_FRAME_FIELD = "frames.detections";

/**
 * Strip the `frames.` prefix from a sample-schema field path to get the
 * per-frame field name the `/frames` endpoint returns. Falls back to the
 * raw value if no prefix is present (defensive — caller already filters
 * to detection fields, which on videos always live under `frames.`).
 */
const toPerFrameField = (field: string): string =>
  field.startsWith("frames.") ? field.slice("frames.".length) : field;

/**
 * Reads the params needed to construct a real `/frames`-backed labels
 * stream from recoil + the modal sample, waits until duration is known
 * (so we can derive `frameCount`), then mounts the registration child
 * with a key that changes if the underlying sample / view / active
 * detection field changes — so a fresh stream cleanly replaces the old
 * one through usePlaybackStream's standard lifecycle.
 *
 * The active stream is published via {@link usePublishFrameLabelsStream} so
 * downstream consumers (track builder, persistence supplier mounted above
 * the surface) can read it via {@link useFrameLabelsStream} without being
 * tied to the registrar's React subtree.
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
  // Active detection field is the source of truth for which per-frame
  // list this stream reads from and which list new edits patch into.
  // Defaults to `frames.detections` while the schema is still resolving
  // so the registrar doesn't repeatedly tear down and re-mount on first
  // render.
  const activeField = useActiveDetectionField() ?? DEFAULT_FRAME_FIELD;

  const frameRate = sample.frameRate;
  const ready =
    duration > 0 && !!sampleId && !!dataset && Number.isFinite(frameRate);

  if (!ready) {
    // Stream params aren't all available yet; consumers read the atom and
    // see `null` until FrameLabelsRegistration mounts.
    return <>{children}</>;
  }

  const frameCount = Math.max(1, Math.round(duration * frameRate));
  const frameField = toPerFrameField(activeField);

  // Include every input that affects the stream's identity in the key so
  // changing sample / view / field re-mounts the registrar with a fresh
  // stream and `usePlaybackStream`'s effect cleanup unregisters the old one.
  const key = `${sampleId}|${dataset}|${
    slice ?? ""
  }|${frameRate}|${frameCount}|${frameField}`;

  return (
    <FrameLabelsRegistration
      key={key}
      sampleId={sampleId}
      dataset={dataset}
      view={view ?? []}
      groupSlice={slice ?? null}
      frameCount={frameCount}
      frameRate={frameRate}
      frameField={frameField}
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
  frameField: string;
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
      frameField: props.frameField,
    });
  }
  usePlaybackStream(streamRef.current);

  // Publish the active stream so consumers above the surface (e.g. the
  // annotation persistence supplier mounted on <Modal>) can reach it
  // through `useFrameLabelsStream()`. The hook handles clear-on-unmount.
  usePublishFrameLabelsStream(streamRef.current);

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

  return <>{children}</>;
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
  const editVersion = useFrameLabelsEditVersion();
  const scheme = useRecoilValue(colorScheme);
  const seed = useRecoilValue(colorSeed);
  const activeField = useActiveDetectionField() ?? DEFAULT_FRAME_FIELD;

  // useState so we can re-render once warmupAll resolves, but keep the
  // build deterministic in the deps (stream identity changes when the
  // sample changes, which is the trigger we care about).
  const [frameTracks, setFrameTracks] = useState<Track[]>([]);
  // Tracked separately from `frameTracks` because an empty list after
  // warmup (clip has no tracked detections) is a legitimately resolved
  // state. We need this signal to drive the one-shot `initialPinnedIds`
  // bootstrap — otherwise a sync-resolved TD list would trip the
  // empty→ready key flip before frame tracks land, and frame tracks
  // would arrive unpinned.
  const [frameTracksResolved, setFrameTracksResolved] = useState(false);

  const resolveColor = useCallback(
    (label: PerInstanceLabel) =>
      getLabelColorFromContext(activeField, label, {
        colorScheme: scheme,
        seed,
      }),
    [activeField, scheme, seed]
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
      setFrameTracksResolved(false);
      return;
    }

    let cancelled = false;

    void stream.warmupAll().then(() => {
      if (cancelled) {
        return;
      }

      setFrameTracks(buildPerInstanceTracks({ stream, resolveColor }));
      setFrameTracksResolved(true);
    });

    return () => {
      cancelled = true;
    };
  }, [stream, resolveColor, editVersion]);

  const pendingTemporalDetectionEdits = useTemporalDetectionPendingEdits();
  const stageTemporalDetectionSupport = useStageTemporalDetectionSupport();

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

    // Apply staged TD-support edits as overrides before building so the
    // bar stays where the user dropped it through the server round-trip.
    // Cleared by `useRegisterVideoAnnotationEventHandlers` on
    // `annotation:persistenceSuccess` / `persistenceError`.
    const baseSample = sample.sample as Record<string, unknown>;
    const overlaidSample =
      pendingTemporalDetectionEdits.size === 0
        ? baseSample
        : applyTemporalDetectionEdits(
            baseSample,
            pendingTemporalDetectionEdits
          );

    return buildTemporalDetectionTracks({
      sample: overlaidSample,
      fps,
      resolveColor: resolveTemporalDetectionColor,
    });
  }, [sample, resolveTemporalDetectionColor, pendingTemporalDetectionEdits]);

  const tracks = useMemo(
    () => [...frameTracks, ...temporalDetectionTracks],
    [frameTracks, temporalDetectionTracks]
  );
  const pinned = useMemo(() => tracks.map((t) => t.id), [tracks]);
  // Bootstrap on frame-tracks-resolved, not on `tracks.length`. TD
  // tracks resolve synchronously from the sample; without this gate,
  // they'd trip the empty→ready flip before frame tracks land and
  // frame tracks would arrive unpinned.
  const ready = frameTracksResolved;
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
        onEventEdit: (
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

          // Stage the edit; the next autosave tick picks it up via
          // `useTemporalDetectionDeltaSupplier` and the persistence event
          // handler clears it on success/error. Undo/redo still TODO —
          // would wrap this in a command on the annotation bus.
          stageTemporalDetectionSupport(
            tdEvent.fieldPath,
            tdEvent.detectionId,
            [firstFrame, lastFrame]
          );
        },
      };
    },
    [linkDecorate, fps, snapStepSec, stageTemporalDetectionSupport]
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
