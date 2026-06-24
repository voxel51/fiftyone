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
  type TrackEventMenuItem,
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
import { useCurrentFrameGetter } from "../state/useCurrentFrame";
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

/** Base linked-overlay decoration the interaction layer attaches per row. */
type BaseTrackDecoration = ReturnType<
  ReturnType<typeof useVideoTrackDecorator>
>;

/** Decoration a track row contributes to {@link TimelineWithTracks}. */
type TrackDecoration = BaseTrackDecoration & {
  snapStepSec?: number;
  eventMenuItems?: TrackEventMenuItem[];
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onEventEdit?: (
    eventIndex: number,
    newStartSec: number,
    newEndSec: number,
    mode: "resize-start" | "resize-end" | "move"
  ) => void;
};

/** Resolves the row color for a per-frame object track. */
type ObjectTrackColorResolver = (label: PerInstanceLabel) => string;

/** Resolves the row color for a temporal-detection track. */
type TemporalDetectionColorResolver = (
  path: string,
  label: TemporalDetectionLabelLike
) => string;

/** Strip the `frames.` prefix so the value matches what `/frames` returns. */
const toPerFrameField = (field: string): string =>
  field.startsWith("frames.") ? field.slice("frames.".length) : field;

/**
 * Reads the params needed to construct a real `/frames`-backed labels
 * stream, waits until duration is known (so we can derive `frameCount`),
 * then mounts the registrar with an identity key so a fresh stream cleanly
 * replaces the old one through usePlaybackStream's lifecycle. The active
 * stream is published via {@link usePublishFrameLabelsStream} for consumers
 * outside the registrar's subtree.
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
  // Source of truth for which per-frame list this stream reads + patches.
  // Default while the schema resolves avoids a tear-down/re-mount churn.
  const activeField = useActiveDetectionField() ?? DEFAULT_FRAME_FIELD;

  const frameRate = getModalSampleFrameRate(sample);
  const ready =
    duration > 0 &&
    !!sampleId &&
    !!dataset &&
    frameRate !== undefined &&
    Number.isFinite(frameRate);

  if (!ready) {
    // Params incomplete; consumers read `null` until the registrar mounts.
    return <>{children}</>;
  }

  const frameCount = Math.max(1, Math.round(duration * frameRate));
  const frameField = toPerFrameField(activeField);

  // Stream-identity key: changing any input re-mounts the registrar so
  // usePlaybackStream's cleanup unregisters the old stream.
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
  // Construct once per mount; the parent re-mounts on identity changes.
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

  // Publish so consumers above the surface reach it via useFrameLabelsStream.
  usePublishFrameLabelsStream(streamRef.current);

  // Prefetch + seek t=0 so overlays paint on first load, not on first play.
  useWarmupThenSeek(streamRef.current);

  return <>{children}</>;
};

/**
 * Build the per-instance object tracks by warming every chunk so the engine
 * re-hydrates across the whole clip, then walking the engine. Returns `[]`
 * until warmup resolves; `resolved` flips true on the first resolved build
 * (including a legitimately empty clip) to gate the pin bootstrap.
 */
function useFrameDerivedTracks(resolveColor: ObjectTrackColorResolver): {
  tracks: Track[];
  resolved: boolean;
} {
  const stream = useFrameLabelsStream();
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const path = stream ? `frames.${stream.labelsField}` : null;

  const [tracks, setTracks] = useState<Track[]>([]);
  const [resolved, setResolved] = useState(false);

  // engine version is the rebuild signal.
  const engineVersion = useEngineSelector(engine, () => engine.getVersion());

  useEffect(() => {
    if (!stream || !sampleId || !path) {
      setTracks([]);
      setResolved(false);
      return undefined;
    }

    let cancelled = false;

    void stream.warmupAll().then(() => {
      if (cancelled) {
        return;
      }

      setTracks(
        buildPerInstanceTracks({
          engine,
          sample: sampleId,
          path,
          totalFrames: stream.totalFrames,
          fps: stream.fps,
          resolveColor,
        })
      );
      setResolved(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engineVersion is the invalidation signal
  }, [engine, sampleId, path, stream, resolveColor, engineVersion]);

  return { tracks, resolved };
}

/**
 * Derive TD tracks from the scene's live `TemporalOverlay` set rather than
 * the sample, which lags an autosave behind local edits. `useTemporalOverlaySync`
 * primes the overlays from the sample on first load.
 */
function useTemporalDetectionTracks(
  sample: ModalSample | undefined,
  resolveColor: TemporalDetectionColorResolver
): Track[] {
  const { scene } = useLighter();
  const tdVersion = useTemporalOverlayVersion(scene, {
    listenLabelEdit: true,
    bumpOnSceneReady: true,
  });
  const frameRate = getModalSampleFrameRate(sample);

  return useMemo(() => {
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
      resolveColor,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tdVersion is the invalidation signal
  }, [scene, frameRate, resolveColor, tdVersion]);
}

/** Build the row-color resolvers, kept in lock-step with the overlays. */
function useTrackColorResolvers(path: string | null): {
  resolveObjectColor: ObjectTrackColorResolver;
  resolveTemporalDetectionColor: TemporalDetectionColorResolver;
} {
  const scheme = useColorScheme();
  const seed = useColorSeed();
  const activeField = useActiveDetectionField() ?? DEFAULT_FRAME_FIELD;

  // Color by the ENGINE path (`frames.detections`) to match the sidebar and
  // canvas; the schema-namespace `activeField` keys a different scheme entry.
  const resolveObjectColor = useCallback(
    (label: PerInstanceLabel) =>
      getLabelColorFromContext(path ?? activeField, label, {
        colorScheme: scheme,
        seed,
      }),
    [path, activeField, scheme, seed]
  );

  const resolveTemporalDetectionColor = useCallback(
    (tdPath: string, label: TemporalDetectionLabelLike) =>
      getLabelColorFromContext(tdPath, label, {
        colorScheme: scheme,
        seed,
      }),
    [scheme, seed]
  );

  return { resolveObjectColor, resolveTemporalDetectionColor };
}

/** Build the row decorator that wires presence-bar edits + menu per kind. */
function useTrackDecorator(
  sample: ModalSample | undefined,
  objectTracks: Track[]
): (track: Track) => TrackDecoration {
  const baseDecorate = useVideoTrackDecorator();
  const actions = useVideoSurfaceActions();
  const stream = useFrameLabelsStream();
  const getCurrentFrame = useCurrentFrameGetter();
  const fps = getModalSampleFrameRate(sample);
  const snapStepSec =
    Number.isFinite(fps) && fps && fps > 0 ? 1 / fps : undefined;

  // The split boundary, captured when the track's context menu OPENS — not read
  // live in the menu item's handler, because clicking a menu item seeks the
  // timeline to the track's start, racing the gesture (explicit payload over
  // implicit context).
  const splitFrameRef = useRef(1);

  // id + label of every object track, the universe of merge targets; each row
  // filters itself out below.
  const mergeCandidates = useMemo(
    () => objectTracks.map((t) => ({ id: t.id, label: t.label })),
    [objectTracks]
  );

  return useCallback(
    (track: Track): TrackDecoration => {
      const base = baseDecorate(track);
      if (!fps) {
        return base;
      }

      // A TD row is identified by its structured event payload; anything else
      // is an engine-addressed object track (row id == instanceId).
      const tdEvent = track.events[0]?.data as
        | TemporalDetectionEventData
        | undefined;
      const isObjectTrack = tdEvent?.detectionId === undefined;

      if (isObjectTrack && stream) {
        return decorateObjectTrack({
          track,
          base,
          snapStepSec,
          fps,
          totalFrames: stream.totalFrames,
          actions,
          getCurrentFrame,
          splitFrameRef,
          mergeTargets: mergeCandidates.filter((c) => c.id !== track.id),
        });
      }

      // Object track with no stream yet: can't wire frame edits — base only.
      if (isObjectTrack) {
        return base;
      }

      return decorateTemporalDetectionTrack({
        tdEvent: tdEvent as TemporalDetectionEventData,
        base,
        snapStepSec,
        fps,
        actions,
      });
    },
    [
      baseDecorate,
      fps,
      snapStepSec,
      actions,
      stream,
      getCurrentFrame,
      mergeCandidates,
    ]
  );
}

/**
 * Labels track timeline — one row per tracked instance (grouped by `index`)
 * plus one row per `TemporalDetection` (rendered as a `support`-spanning
 * interval). Untracked labels still paint as overlays but get no rows.
 *
 * One-shot re-key on the empty→ready transition so `initialPinnedIds` (read
 * only at mount) bootstraps from the real frame-track list; later recolors
 * update through the live `tracks` prop and preserve the user's pin state.
 */
export const FrameLabelsTracks: React.FC<{ sample?: ModalSample }> = ({
  sample,
}) => {
  const stream = useFrameLabelsStream();
  const path = stream ? `frames.${stream.labelsField}` : null;

  const { resolveObjectColor, resolveTemporalDetectionColor } =
    useTrackColorResolvers(path);

  const { tracks: frameTracks, resolved: frameTracksResolved } =
    useFrameDerivedTracks(resolveObjectColor);
  const temporalDetectionTracks = useTemporalDetectionTracks(
    sample,
    resolveTemporalDetectionColor
  );

  const tracks = useMemo(
    () => [...frameTracks, ...temporalDetectionTracks],
    [frameTracks, temporalDetectionTracks]
  );
  const pinned = useMemo(() => tracks.map((t) => t.id), [tracks]);

  // Bootstrap on frame-tracks-resolved, not `tracks.length`: TD tracks resolve
  // synchronously and would otherwise trip the empty→ready flip before frame
  // tracks land, leaving frame tracks unpinned.
  const ready = frameTracksResolved;

  useScrollTrackToAnchor();
  const decorateTrack = useTrackDecorator(sample, frameTracks);

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

/** Decorate an object track: snap, delete, and presence-bar drag edits. */
function decorateObjectTrack({
  track,
  base,
  snapStepSec,
  fps,
  totalFrames,
  actions,
  getCurrentFrame,
  splitFrameRef,
  mergeTargets,
}: {
  track: Track;
  base: BaseTrackDecoration;
  snapStepSec: number | undefined;
  fps: number;
  totalFrames: number;
  actions: VideoSurfaceActions;
  getCurrentFrame: () => number;
  splitFrameRef: React.MutableRefObject<number>;
  mergeTargets: { id: string; label: string }[];
}): TrackDecoration {
  const menuItems: TrackEventMenuItem[] = [
    {
      label: "Delete track",
      destructive: true,
      onSelect: () => actions.deleteTrack(track.id),
    },
    {
      // splits at the frame captured when the menu opened (see onContextMenu)
      label: "Split at playhead",
      onSelect: () => actions.splitTrack(track.id, splitFrameRef.current),
    },
    ...mergeTargets.map((target) => ({
      label: `Merge into ${target.label}`,
      onSelect: () => actions.mergeTracks(track.id, target.id),
    })),
  ];

  return {
    ...base,
    snapStepSec,
    eventMenuItems: menuItems,
    // snapshot the playhead frame as the menu opens, before the item click
    // seeks the timeline to the track start
    onContextMenu: () => {
      splitFrameRef.current = getCurrentFrame();
    },
    onEventEdit: (eventIndex, newStartSec, newEndSec, mode) =>
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

/** Decorate a TD track: snap, delete, and interval drag edits. */
function decorateTemporalDetectionTrack({
  tdEvent,
  base,
  snapStepSec,
  fps,
  actions,
}: {
  tdEvent: TemporalDetectionEventData;
  base: BaseTrackDecoration;
  snapStepSec: number | undefined;
  fps: number;
  actions: VideoSurfaceActions;
}): TrackDecoration {
  return {
    ...base,
    snapStepSec,
    eventMenuItems: [
      {
        label: "Delete track",
        destructive: true,
        onSelect: () =>
          actions.deleteTemporalDetection(
            tdEvent.fieldPath,
            tdEvent.detectionId
          ),
      },
    ],
    onEventEdit: (_eventIndex, newStartSec, newEndSec) =>
      applyTemporalDetectionEdit({
        tdEvent,
        newStartSec,
        newEndSec,
        fps,
        actions,
      }),
  };
}

/**
 * Project scene `TemporalOverlay`s into a sample-shaped dict so
 * {@link buildTemporalDetectionTracks} consumes live overlay state the same
 * way it consumes a server sample.
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

  // Other presence bars of this track — used to clamp a move against neighbors.
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
 * inclusive frame `support` and dispatch the edit. Inverts the build's
 * mapping: `startSec = (firstFrame - 1) / fps`, `endSec = lastFrame / fps`.
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
