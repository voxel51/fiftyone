import {
  useActiveSampleId,
  useAnnotationEngine,
  useEngineSelector,
} from "@fiftyone/annotation";
import {
  getLabelColorFromContext,
  TemporalOverlay,
  useLighter,
} from "@fiftyone/lighter";
import type { ModalSample } from "@fiftyone/state";
import type { Stage } from "@fiftyone/utilities";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useActiveDetectionField,
  useColorScheme,
  useColorSeed,
  useDatasetName,
  useGroupSlice,
  useModalSampleId,
  useView,
} from "../state/accessors";
import { useTemporalOverlayVersion } from "../hooks/useTemporalOverlayVersion";
import { useWarmupThenSeek } from "../hooks/useWarmupThenSeek";
import {
  TimelineWithTracks,
  TrackProvider,
  type Track,
  useDuration,
  usePlaybackStream,
} from "@fiftyone/playback";
import {
  useFrameLabelsStream,
  usePublishFrameLabelsStream,
} from "../streams/frameLabelsStream";
import {
  buildPerInstanceTracks,
  type PerInstanceLabel,
} from "../tracks/frameTracks";
import { LABELS_STREAM_ID } from "../utils/ids";
import { getModalSampleFrameRate } from "../utils/modalSample";
import { resolveTrackExtentEdit } from "../tracks/trackExtentEdit";
import { useVideoTrackDecorator } from "../tracks/useVideoTrackDecorator";
import { useScrollTrackToAnchor } from "../state/useVideoInteraction";
import {
  useVideoSurfaceActions,
  type VideoSurfaceActions,
} from "../hooks/useVideoSurfaceActions";
import {
  buildTemporalDetectionTracks,
  type TemporalDetectionEventData,
  type TemporalDetectionLabelLike,
} from "../tracks/temporalDetectionTracks";
import { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";
import { VideoAnnotationToolbar } from "./VideoAnnotationToolbar";

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
  const dataset = useDatasetName();
  const view = useView();
  const slice = useGroupSlice();
  const sampleId = useModalSampleId();
  // Active detection field is the source of truth for which per-frame
  // list this stream reads from and which list new edits patch into.
  // Defaults to `frames.detections` while the schema is still resolving
  // so the registrar doesn't repeatedly tear down and re-mount on first
  // render.
  const activeField = useActiveDetectionField() ?? DEFAULT_FRAME_FIELD;

  const frameRate = getModalSampleFrameRate(sample);
  const ready =
    duration > 0 &&
    !!sampleId &&
    !!dataset &&
    frameRate !== undefined &&
    Number.isFinite(frameRate);

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
      view={view}
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

  // Prefetch the chunk containing t=0 and seek there, so overlays paint on
  // first load instead of staying blank until the user presses play.
  useWarmupThenSeek(streamRef.current);

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
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const scheme = useColorScheme();
  const seed = useColorSeed();
  const activeField = useActiveDetectionField() ?? DEFAULT_FRAME_FIELD;

  // The engine projects the timeline; its version is the rebuild signal.
  const engineVersion = useEngineSelector(engine, () => engine.getVersion());
  // Frame-detection field the engine FrameStore is registered under.
  const path = stream ? `frames.${stream.labelsField}` : null;

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
    if (!stream || !sampleId || !path) {
      setFrameTracks([]);
      setFrameTracksResolved(false);
      return undefined;
    }

    let cancelled = false;

    // Warm every chunk so the `/frames` seed re-hydrates the engine across the
    // whole clip; the build then walks the engine, not the stream.
    void stream.warmupAll().then(() => {
      if (cancelled) {
        return;
      }

      setFrameTracks(
        buildPerInstanceTracks({
          engine,
          sample: sampleId,
          path,
          totalFrames: stream.totalFrames,
          fps: stream.fps,
          resolveColor,
        })
      );
      setFrameTracksResolved(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engineVersion is the invalidation signal
  }, [engine, sampleId, path, stream, resolveColor, engineVersion]);

  const actions = useVideoSurfaceActions();

  // Live-derived TD tracks: walk the scene's `TemporalOverlay` set rather
  // than the sample (which lags one autosave round-trip behind local
  // edits). Overlays are the source of truth — `useTemporalOverlaySync`
  // primes them from the sample on first load.
  const { scene } = useLighter();
  const tdVersion = useTemporalOverlayVersion(scene, {
    listenLabelEdit: true,
    bumpOnSceneReady: true,
  });
  const frameRate = getModalSampleFrameRate(sample);

  const temporalDetectionTracks = useMemo(() => {
    if (!scene) {
      return [];
    }

    if (
      frameRate === undefined ||
      !Number.isFinite(frameRate) ||
      frameRate <= 0
    ) {
      return [];
    }

    const temporalOverlays = scene
      .getAllOverlays()
      .filter((o): o is TemporalOverlay => o instanceof TemporalOverlay);

    return buildTemporalDetectionTracks({
      sample: buildVirtualTemporalSample(temporalOverlays),
      fps: frameRate,
      resolveColor: resolveTemporalDetectionColor,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tdVersion is the invalidation signal
  }, [scene, frameRate, resolveTemporalDetectionColor, tdVersion]);

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
  const baseDecorate = useVideoTrackDecorator();
  useScrollTrackToAnchor();
  const fps = getModalSampleFrameRate(sample);
  const snapStepSec =
    Number.isFinite(fps) && fps && fps > 0 ? 1 / fps : undefined;

  // Compose: keep the linked-overlay wiring (hover / select / scroll)
  // and layer TD-specific resize wiring on top for TD rows. TD rows
  // have no Lighter overlay, so the linked-overlay calls are no-ops on
  // them — they don't break, just don't do anything visible.
  const decorateTrack = useCallback(
    (track: Track) => {
      const base = baseDecorate(track);
      if (!fps) {
        return base;
      }

      // Object tracks: drag a presence bar to extend / trim / shift the
      // track's per-frame labels. TD rows carry the `td-` prefix; everything
      // else is an engine-addressed object track (row id == instanceId).
      const isObjectTrack = !track.id.startsWith("td-");

      if (isObjectTrack && stream) {
        const totalFrames = stream.totalFrames;

        return {
          ...base,
          snapStepSec,
          eventDeleteConfig: {
            label: "Delete track",
            onDelete: () => actions.deleteTrack(track.id),
          },
          onEventEdit: (
            eventIndex: number,
            newStartSec: number,
            newEndSec: number,
            mode: "resize-start" | "resize-end" | "move"
          ) =>
            applyObjectTrackEdit({
              track,
              eventIndex,
              newStartSec,
              newEndSec,
              mode,
              fps,
              totalFrames,
              actions,
            }),
        };
      }

      const tdEvent = track.events[0]?.data as
        | TemporalDetectionEventData
        | undefined;
      const isTemporalDetection =
        track.id.startsWith("td-") && tdEvent !== undefined;
      if (!isTemporalDetection) {
        return base;
      }

      return {
        ...base,
        snapStepSec,
        eventDeleteConfig: {
          label: "Delete track",
          onDelete: () =>
            actions.deleteTemporalDetection(
              tdEvent.fieldPath,
              tdEvent.detectionId
            ),
        },
        onEventEdit: (
          _eventIndex: number,
          newStartSec: number,
          newEndSec: number
        ) =>
          applyTemporalDetectionEdit({
            tdEvent,
            newStartSec,
            newEndSec,
            fps,
            actions,
          }),
      };
    },
    [baseDecorate, fps, snapStepSec, actions, stream]
  );

  return (
    <TrackProvider
      key={ready ? "ready" : "init"}
      tracks={tracks}
      initialPinnedIds={pinned}
    >
      <TimelineWithTracks
        decorateTrack={decorateTrack}
        extraControls={<VideoAnnotationToolbar />}
      />
    </TrackProvider>
  );
};

/**
 * Project a set of scene `TemporalOverlay`s into a sample-shaped dict
 * (`{ [field]: { _cls: "TemporalDetections", detections } }`) so
 * {@link buildTemporalDetectionTracks} can consume the live overlay state
 * the same way it consumes a server sample.
 */
function buildVirtualTemporalSample(
  overlays: TemporalOverlay[]
): Record<string, unknown> {
  const byField = new Map<string, unknown[]>();
  for (const overlay of overlays) {
    const detections = byField.get(overlay.field) ?? [];
    detections.push(overlay.label);
    byField.set(overlay.field, detections);
  }

  const virtualSample: Record<string, unknown> = {};
  for (const [field, detections] of byField) {
    virtualSample[field] = { _cls: "TemporalDetections", detections };
  }

  return virtualSample;
}

/**
 * Apply an object-track presence-bar drag: resolve it to an extend / trim /
 * shift edit and dispatch the matching command. No-op for a degenerate drag.
 */
function applyObjectTrackEdit({
  track,
  eventIndex,
  newStartSec,
  newEndSec,
  mode,
  fps,
  totalFrames,
  actions,
}: {
  track: Track;
  eventIndex: number;
  newStartSec: number;
  newEndSec: number;
  mode: "resize-start" | "resize-end" | "move";
  fps: number;
  totalFrames: number;
  actions: VideoSurfaceActions;
}): void {
  const dragged = track.events[eventIndex];
  if (!dragged || dragged.endSec === undefined) {
    return;
  }

  // Other presence bars of this same track — used to clamp a move so it
  // can't overrun a neighbouring segment.
  const neighborSegments = track.events
    .filter((e, i) => i !== eventIndex && e.endSec !== undefined)
    .map(
      (e) =>
        [
          Math.round(e.startSec * fps) + 1,
          Math.round((e.endSec as number) * fps),
        ] as const
    );

  const edit = resolveTrackExtentEdit({
    mode,
    origStartSec: dragged.startSec,
    origEndSec: dragged.endSec,
    newStartSec,
    newEndSec,
    fps,
    totalFrames,
    neighborSegments,
  });

  switch (edit.op) {
    case "extend":
      actions.extendTrack(track.id, edit.sourceFrame, edit.targetFrames);
      break;
    case "trim":
      actions.trimTrack(track.id, edit.frames);
      break;
    case "shift":
      actions.shiftTrack(track.id, edit.frames, edit.delta);
      break;
    default:
      break;
  }
}

/**
 * Apply a TD interval drag: convert the dragged seconds back to a 1-indexed
 * inclusive frame `support` and dispatch the edit.
 *
 * Inverts the build's mapping: `startSec = (firstFrame - 1) / fps` and
 * `endSec = lastFrame / fps`.
 */
function applyTemporalDetectionEdit({
  tdEvent,
  newStartSec,
  newEndSec,
  fps,
  actions,
}: {
  tdEvent: TemporalDetectionEventData;
  newStartSec: number;
  newEndSec: number;
  fps: number;
  actions: VideoSurfaceActions;
}): void {
  const firstFrame = Math.max(1, Math.round(newStartSec * fps) + 1);
  const lastFrame = Math.max(firstFrame, Math.round(newEndSec * fps));

  actions.editTemporalDetection(tdEvent.fieldPath, tdEvent.detectionId, {
    support: [firstFrame, lastFrame],
  });
}
