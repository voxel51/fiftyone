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
  useDynamicAttributeNames,
  useGroupSlice,
  useModalSampleId,
  useView,
  useVisibleLabelSchemas,
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
  parseSubTrackId,
  type PerInstanceLabel,
} from "../tracks/frameTracks";
import {
  useTrackExpansion,
  type TrackExpansion,
} from "../tracks/useTrackExpansion";
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

/** Base linked-overlay decoration the interaction layer attaches per row. */
type BaseTrackDecoration = ReturnType<
  ReturnType<typeof useVideoTrackDecorator>
>;

/** Decoration a track row contributes to {@link TimelineWithTracks}. */
type TrackDecoration = BaseTrackDecoration & {
  snapStepSec?: number;
  eventDeleteConfig?: { label: string; onDelete: () => void };
  onEventEdit?: (
    eventIndex: number,
    newStartSec: number,
    newEndSec: number,
    mode: "resize-start" | "resize-end" | "move"
  ) => void;
  depth?: number;
  isChild?: boolean;
  height?: number;
  expansionGutter?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
};

/** Row height (px) for a dynamic-attribute sub-track — shorter than a parent. */
const SUB_TRACK_ROW_HEIGHT = 22;

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
function useFrameDerivedTracks(
  resolveColor: ObjectTrackColorResolver,
  dynamicAttributes: string[]
): {
  tracks: Track[];
  resolved: boolean;
} {
  const stream = useFrameLabelsStream();
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const visible = useVisibleLabelSchemas();
  const path = stream ? `frames.${stream.labelsField}` : null;

  // Gate the frame field's tracks on the sidebar's visible set — deactivating it
  // in the schema manager hides its timeline rows, matching the canvas + sidebar.
  const active = !!path && visible.has(path);

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

    // Inactive field: no rows, but still resolved so TD-track pin bootstrap fires.
    if (!active) {
      setTracks([]);
      setResolved(true);
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
          dynamicAttributes,
        })
      );
      setResolved(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engineVersion is the invalidation signal
  }, [
    engine,
    sampleId,
    path,
    active,
    stream,
    resolveColor,
    dynamicAttributes,
    engineVersion,
  ]);

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
  const visible = useVisibleLabelSchemas();

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

    // Only overlays whose field is visible — a deactivated TD field drops its
    // timeline rows, matching the canvas + sidebar.
    const temporalOverlays = scene
      .getAllOverlays()
      .filter((o): o is TemporalOverlay => o instanceof TemporalOverlay)
      .filter((o) => visible.has(o.field));

    return buildTemporalDetectionTracks({
      sample: buildVirtualTemporalSample(temporalOverlays),
      fps: frameRate,
      resolveColor,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tdVersion is the invalidation signal
  }, [scene, frameRate, resolveColor, tdVersion, visible]);
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

/** Build the row decorator that wires presence-bar edits + delete per kind. */
function useTrackDecorator({
  sample,
  expansion,
  expandableParentIds,
}: {
  sample: ModalSample | undefined;
  expansion: TrackExpansion;
  expandableParentIds: ReadonlySet<string>;
}): (track: Track) => TrackDecoration {
  const baseDecorate = useVideoTrackDecorator();
  const actions = useVideoSurfaceActions();
  const stream = useFrameLabelsStream();
  const fps = getModalSampleFrameRate(sample);
  const snapStepSec =
    Number.isFinite(fps) && fps && fps > 0 ? 1 / fps : undefined;

  return useCallback(
    (track: Track): TrackDecoration => {
      // A sub-track row links its hover / selection to the PARENT instance and
      // renders as an indented child; it owns no presence-bar edits.
      const sub = parseSubTrackId(track.id);
      if (sub) {
        const parentLink = baseDecorate({ ...track, id: sub.parentId });
        return {
          ...parentLink,
          expansionGutter: true,
          depth: 1,
          isChild: true,
          height: SUB_TRACK_ROW_HEIGHT,
        };
      }

      const base = baseDecorate(track);
      if (!fps) {
        return { ...base, expansionGutter: true };
      }

      // A TD row is identified by its structured event payload; anything else
      // is an engine-addressed object track (row id == instanceId).
      const tdEvent = track.events[0]?.data as
        | TemporalDetectionEventData
        | undefined;
      const isObjectTrack = tdEvent?.detectionId === undefined;

      if (isObjectTrack && stream) {
        const decorated = decorateObjectTrack({
          track,
          base,
          snapStepSec,
          fps,
          totalFrames: stream.totalFrames,
          actions,
        });

        if (!expandableParentIds.has(track.id)) {
          return { ...decorated, expansionGutter: true };
        }

        return {
          ...decorated,
          expansionGutter: true,
          expandable: true,
          expanded: expansion.isExpanded(track.id),
          onToggleExpand: () => expansion.toggle(track.id),
        };
      }

      // Object track with no stream yet: can't wire frame edits — base only.
      if (isObjectTrack) {
        return { ...base, expansionGutter: true };
      }

      return {
        ...decorateTemporalDetectionTrack({
          tdEvent: tdEvent as TemporalDetectionEventData,
          base,
          snapStepSec,
          fps,
          actions,
        }),
        expansionGutter: true,
      };
    },
    [
      baseDecorate,
      fps,
      snapStepSec,
      actions,
      stream,
      expansion,
      expandableParentIds,
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

  const dynamicAttributeNames = useDynamicAttributeNames(path);

  const { tracks: frameTracks, resolved: frameTracksResolved } =
    useFrameDerivedTracks(resolveObjectColor, dynamicAttributeNames);
  const temporalDetectionTracks = useTemporalDetectionTracks(
    sample,
    resolveTemporalDetectionColor
  );

  // Object tracks (with their sub-tracks interleaved) followed by TD tracks.
  const tracks = useMemo(
    () => [...frameTracks, ...temporalDetectionTracks],
    [frameTracks, temporalDetectionTracks]
  );

  const expansion = useTrackExpansion();

  // Parents carrying at least one sub-track — only these get an expand chevron.
  const expandableParentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const track of tracks) {
      const sub = parseSubTrackId(track.id);
      if (sub) {
        ids.add(sub.parentId);
      }
    }

    return ids;
  }, [tracks]);

  // Hide a collapsed parent's sub-track rows; everything else renders.
  const visibleTracks = useMemo(
    () =>
      tracks.filter((track) => {
        const sub = parseSubTrackId(track.id);
        return !sub || expansion.expandedIds.has(sub.parentId);
      }),
    [tracks, expansion.expandedIds]
  );

  const pinned = useMemo(() => visibleTracks.map((t) => t.id), [visibleTracks]);

  // Bootstrap on frame-tracks-resolved, not `tracks.length`: TD tracks resolve
  // synchronously and would otherwise trip the empty→ready flip before frame
  // tracks land, leaving frame tracks unpinned.
  const ready = frameTracksResolved;

  useScrollTrackToAnchor();
  const decorateTrack = useTrackDecorator({
    sample,
    expansion,
    expandableParentIds,
  });

  return (
    <TrackProvider
      key={ready ? "ready" : "init"}
      tracks={visibleTracks}
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
}: {
  track: Track;
  base: BaseTrackDecoration;
  snapStepSec: number | undefined;
  fps: number;
  totalFrames: number;
  actions: VideoSurfaceActions;
}): TrackDecoration {
  return {
    ...base,
    snapStepSec,
    eventDeleteConfig: {
      label: "Delete track",
      onDelete: () => actions.deleteTrack(track.id),
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
    eventDeleteConfig: {
      label: "Delete track",
      onDelete: () =>
        actions.deleteTemporalDetection(tdEvent.fieldPath, tdEvent.detectionId),
    },
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
