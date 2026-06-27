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
import type { LabelData, Stage } from "@fiftyone/utilities";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useActiveDetectionField,
  useColorScheme,
  useColorSeed,
  useDatasetName,
  useDynamicAttributeNames,
  useFrameLabelFields,
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
  type TrackEventMenuItem,
  useDuration,
  usePlaybackStream,
} from "@fiftyone/playback";
import {
  useFrameLabelsStream,
  usePublishFrameLabelsStream,
} from "../streams/frameLabelsStream";
import {
  buildTracksFromIndex,
  parseSubTrackId,
  type FrameOverlay,
  type PerInstanceLabel,
} from "../tracks/frameTracks";
import { useVideoLabelsIndex } from "../hooks/useVideoLabelsIndex";
import {
  useTrackExpansion,
  type TrackExpansion,
} from "../tracks/useTrackExpansion";
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
    mode: "resize-start" | "resize-end" | "move",
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
type ObjectTrackColorResolver = (
  label: PerInstanceLabel,
  path: string,
) => string;

/** Resolves the row color for a temporal-detection track. */
type TemporalDetectionColorResolver = (
  path: string,
  label: TemporalDetectionLabelLike,
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
  // Every active per-frame field — the stream fetches + seeds all of them so the
  // engine (and the sidebar/canvas/timeline that read it) sees more than just
  // the primary detection field (e.g. polylines, masked detections).
  const labelFields = useFrameLabelFields();

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
  // All active per-frame fields, frame-relative, primary first — deduped + sorted
  // so the identity key is stable regardless of schema iteration order.
  const frameFields = [
    ...new Set([
      frameField,
      ...Object.keys(labelFields).map(toPerFrameField).sort(),
    ]),
  ];

  // Stream-identity key: changing any input re-mounts the registrar so
  // usePlaybackStream's cleanup unregisters the old stream. Keyed on the
  // *set* of fetched fields (sorted), NOT their primary-first order — a
  // field-move flips which field is primary (most-populated) without changing
  // the set, and a re-mount there would tear down the engine's frame store and
  // discard the move's unsaved edits. The primary follows in place via
  // `setPrimaryField` (below); only adding/removing a field re-mounts.
  const fieldSetKey = [...frameFields].sort().join(",");
  const key = `${sampleId}|${dataset}|${
    slice ?? ""
  }|${frameRate}|${frameCount}|${fieldSetKey}`;

  return (
    <FrameLabelsRegistration
      key={key}
      sampleId={sampleId}
      dataset={dataset}
      view={view}
      frameCount={frameCount}
      frameRate={frameRate}
      frameField={frameField}
      frameFields={frameFields}
    >
      {children}
    </FrameLabelsRegistration>
  );
};

interface FrameLabelsRegistrationProps {
  sampleId: string;
  dataset: string;
  view: Stage[];
  frameCount: number;
  frameRate: number;
  frameField: string;
  frameFields: string[];
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
      frameCount: props.frameCount,
      frameRate: props.frameRate,
      frameField: props.frameField,
      frameFields: props.frameFields,
    });
  }

  // The primary field can change without a re-mount (the key is set-based, not
  // order-based), so push it onto the existing stream in place — no refetch,
  // since every field is already cached.
  const stream = streamRef.current;
  useEffect(() => {
    stream.setPrimaryField(props.frameField);
  }, [stream, props.frameField]);

  usePlaybackStream(streamRef.current);

  // Publish so consumers above the surface reach it via useFrameLabelsStream.
  usePublishFrameLabelsStream(streamRef.current);

  // Prefetch + seek t=0 so overlays paint on first load, not on first play.
  useWarmupThenSeek(streamRef.current);

  return <>{children}</>;
};

/**
 * Build the per-instance object tracks from the server distribution index
 * merged with the engine's edited-frame overlay — no whole-clip walk. Tracks
 * rebuild on each engine commit (cheap: only the dirty frames are read).
 * `resolved` flips true once the index settles, gating the pin bootstrap.
 */
function useFrameDerivedTracks(
  resolveColor: ObjectTrackColorResolver,
  dynamicAttributes: string[],
): {
  tracks: Track[];
  resolved: boolean;
} {
  const stream = useFrameLabelsStream();
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const visible = useVisibleLabelSchemas();
  const labelTypes = useFrameLabelFields();

  // Fetch the index for every declared frame label field (stable per dataset/
  // view) so visibility toggles filter client-side without re-fetching.
  const allFields = useMemo(() => Object.keys(labelTypes), [labelTypes]);

  // Gate each frame field's tracks on the sidebar's visible set — deactivating
  // a field in the schema manager hides its timeline rows, matching the canvas
  // + sidebar.
  const paths = useMemo(
    () => allFields.filter((p) => visible.has(p)),
    [allFields, visible],
  );

  const { indexByPath, loaded } = useVideoLabelsIndex(
    stream,
    allFields,
    dynamicAttributes,
  );

  // engine version is the rebuild signal.
  const engineVersion = useEngineSelector(engine, () => engine.getVersion());

  // No visible frame field, or the index hasn't settled: no rows. Tracks build
  // per visible field from that field's index ⊕ its dirty-frame overlay, then
  // concatenate — instance ids are unique across fields, so the rows just merge.
  const tracks = useMemo(() => {
    if (!stream || !sampleId || !loaded || paths.length === 0) {
      return [];
    }

    return paths.flatMap((path) =>
      buildTracksFromIndex({
        path,
        index: indexByPath[path] ?? [],
        overlay: readEngineOverlay(engine, sampleId, path),
        fps: stream.fps,
        resolveColor,
        dynamicAttributes,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engineVersion is the invalidation signal
  }, [
    engine,
    sampleId,
    paths,
    stream,
    resolveColor,
    indexByPath,
    loaded,
    dynamicAttributes,
    engineVersion,
  ]);

  return { tracks, resolved: loaded };
}

/**
 * The engine's materialized frames + their live labels, keyed by frame number —
 * the overlay that shadows the server index. Reads every loaded frame, not just
 * the dirty set: a successful autosave folds edits into the seed and clears the
 * dirty set, so a dirty-only overlay would revert the timeline to the stale
 * index after each save. The engine is authoritative for every frame it holds,
 * so overlaying all of them keeps the timeline correct post-save and composes
 * index (unloaded) ⊕ engine (loaded window) once the seed is windowed. Bounded
 * by the loaded window, which today is the whole clip (see `warmupAll`).
 */
function readEngineOverlay(
  engine: ReturnType<typeof useAnnotationEngine>,
  sample: string,
  path: string,
): FrameOverlay {
  const overlay: FrameOverlay = new Map<number, LabelData[]>();

  for (const frame of engine.loadedFrames(sample)) {
    overlay.set(frame, engine.listLabels({ sample, path, frame }));
  }

  return overlay;
}

/**
 * Derive TD tracks from the scene's live `TemporalOverlay` set rather than
 * the sample, which lags an autosave behind local edits. `useTemporalOverlaySync`
 * primes the overlays from the sample on first load.
 */
function useTemporalDetectionTracks(
  sample: ModalSample | undefined,
  resolveColor: TemporalDetectionColorResolver,
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
function useTrackColorResolvers(): {
  resolveObjectColor: ObjectTrackColorResolver;
  resolveTemporalDetectionColor: TemporalDetectionColorResolver;
} {
  const scheme = useColorScheme();
  const seed = useColorSeed();

  // Color by each row's own ENGINE path (`frames.detections`,
  // `frames.polylines`, …) so the row matches its overlay's color and
  // multi-field rows don't collapse onto one field's scheme entry.
  const resolveObjectColor = useCallback(
    (label: PerInstanceLabel, path: string) =>
      getLabelColorFromContext(path, label, {
        colorScheme: scheme,
        seed,
      }),
    [scheme, seed],
  );

  const resolveTemporalDetectionColor = useCallback(
    (tdPath: string, label: TemporalDetectionLabelLike) =>
      getLabelColorFromContext(tdPath, label, {
        colorScheme: scheme,
        seed,
      }),
    [scheme, seed],
  );

  return { resolveObjectColor, resolveTemporalDetectionColor };
}

/** Build the row decorator that wires presence-bar edits + menu per kind. */
function useTrackDecorator({
  sample,
  objectTracks,
  expansion,
  expandableParentIds,
}: {
  sample: ModalSample | undefined;
  objectTracks: Track[];
  expansion: TrackExpansion;
  expandableParentIds: ReadonlySet<string>;
}): (track: Track) => TrackDecoration {
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
    () =>
      objectTracks
        .filter((t) => !parseSubTrackId(t.id))
        .map((t) => ({ id: t.id, label: t.label })),
    [objectTracks],
  );

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
          getCurrentFrame,
          splitFrameRef,
          mergeTargets: mergeCandidates.filter((c) => c.id !== track.id),
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
      getCurrentFrame,
      mergeCandidates,
      expansion,
      expandableParentIds,
    ],
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
  const { resolveObjectColor, resolveTemporalDetectionColor } =
    useTrackColorResolvers();

  // Dynamic attributes are declared on the primary labels stream's field.
  const stream = useFrameLabelsStream();
  const path = stream ? `frames.${stream.labelsField}` : null;
  const dynamicAttributeNames = useDynamicAttributeNames(path);

  const { tracks: frameTracks, resolved: frameTracksResolved } =
    useFrameDerivedTracks(resolveObjectColor, dynamicAttributeNames);
  const temporalDetectionTracks = useTemporalDetectionTracks(
    sample,
    resolveTemporalDetectionColor,
  );

  // Object tracks (with their sub-tracks interleaved) followed by TD tracks.
  const tracks = useMemo(
    () => [...frameTracks, ...temporalDetectionTracks],
    [frameTracks, temporalDetectionTracks],
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
    [tracks, expansion.expandedIds],
  );

  const pinned = useMemo(() => visibleTracks.map((t) => t.id), [visibleTracks]);

  // Bootstrap on frame-tracks-resolved, not `tracks.length`: TD tracks resolve
  // synchronously and would otherwise trip the empty→ready flip before frame
  // tracks land, leaving frame tracks unpinned.
  const ready = frameTracksResolved;

  useScrollTrackToAnchor();
  const decorateTrack = useTrackDecorator({
    sample,
    objectTracks: frameTracks,
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
        autoExpandOnFirstTrack
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
            tdEvent.detectionId,
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
  overlays: TemporalOverlay[],
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
        ] as const,
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
