import { getLabelColorFromContext } from "@fiftyone/lighter";
import type { ModalSample } from "@fiftyone/state";
import type { Stage } from "@fiftyone/utilities";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useActiveDetectionField,
  useColorScheme,
  useColorSeed,
  useDatasetName,
  useDynamicAttributeNamesGetter,
  useDynamicGroupValue,
  useFrameLabelFields,
  useGroupSlice,
  useModalSampleFrameRate,
  useModalSampleId,
  useView,
  useLabelSchemasLoaded,
  useVisibleLabelSchemas,
} from "../state/accessors";
import { useEngineTemporalSample } from "../sync/useTemporalOverlaySync";
import { useWarmupThenSeek } from "../hooks/useWarmupThenSeek";
import {
  TimelineWithTracks,
  TrackProvider,
  type TimelineTracksScroller,
  type Track,
  type TrackEventMenuItem,
  useActivateStream,
  useDuration,
  usePlaybackStream,
} from "@fiftyone/playback";
import {
  useFrameLabelsStream,
  usePublishFrameLabelsStream,
} from "../streams/frameLabelsStream";
import {
  objectTrackClassOf,
  objectTrackPathOf,
  parseSubTrackId,
  type PerInstanceLabel,
} from "../tracks/frameTracks";
import {
  useFrameDerivedTracks,
  type ObjectTrackColorResolver,
} from "../tracks/useFrameDerivedTracks";
import {
  useTrackExpansion,
  type TrackExpansion,
} from "../tracks/useTrackExpansion";
import { LABELS_STREAM_ID } from "../utils/ids";
import { resolveTrackExtentEdit } from "../tracks/trackExtentEdit";
import { useVideoTrackDecorator } from "../tracks/useVideoTrackDecorator";
import { useScrollTrackToAnchor } from "../state/useVideoInteraction";
import { useCurrentFrameGetter } from "../state/useCurrentFrame";
import { useSetTimelineLoaded } from "../state/surfaceReveal";
import { useTimelineDrawerOpen } from "../state/useTimelineDrawer";
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

/**
 * Most "Merge into …" entries to offer on one track's menu.
 *
 * A merge target has to be a different track of the same class on the same
 * field, which on a densely tracked sample can be thousands of rows — a menu
 * nobody can use, and one whose element tree we'd rebuild on every render of
 * the row. Capping keeps the common case (a handful of fragments of the same
 * object) intact; past that the menu stops being the right tool and the user
 * wants the merge dialog.
 */
const MAX_MERGE_TARGETS = 12;

/** Bucket key gating merge: same field path AND same class. */
const mergeGroupKey = (
  path: string | null,
  classLabel: string | null,
): string => `${path ?? ""}\u0000${classLabel ?? ""}`;

/** A merge candidate plus where it sits in time, for proximity ranking. */
interface MergeCandidate {
  id: string;
  label: string;
  /** Start of the track's first presence bar; its position on the timeline. */
  startSec: number;
}

/** Where a track begins, for ranking merge candidates against it. */
const trackStartSec = (track: Track): number => track.events[0]?.startSec ?? 0;

/**
 * The merge targets offered for `track`: its own bucket, minus itself, nearest
 * first, capped at {@link MAX_MERGE_TARGETS}, plus how many the cap dropped.
 *
 * Ranked by distance in time rather than list position. Merging almost always
 * means rejoining fragments of one object that got split, and those sit next
 * to each other on the timeline — taking the head of the bucket instead would
 * offer a late-ordered track twelve unrelated candidates and silently omit its
 * actual neighbour.
 */
function mergeTargetsFor(
  groups: ReadonlyMap<string, MergeCandidate[]>,
  track: Track,
): { mergeTargets: { id: string; label: string }[]; omitted: number } {
  const bucket = groups.get(
    mergeGroupKey(objectTrackPathOf(track), objectTrackClassOf(track)),
  );
  if (!bucket) return { mergeTargets: [], omitted: 0 };

  const from = trackStartSec(track);
  const ranked = bucket
    .filter((candidate) => candidate.id !== track.id)
    .sort(
      (a, b) =>
        Math.abs(a.startSec - from) - Math.abs(b.startSec - from) ||
        a.id.localeCompare(b.id),
    );

  return {
    mergeTargets: ranked
      .slice(0, MAX_MERGE_TARGETS)
      .map(({ id, label }) => ({ id, label })),
    omitted: Math.max(0, ranked.length - MAX_MERGE_TARGETS),
  };
}

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
  const dynamicGroup = useDynamicGroupValue();
  // Source of truth for which per-frame list this stream reads + patches.
  // Default while the schema resolves avoids a tear-down/re-mount churn.
  const activeField = useActiveDetectionField() ?? DEFAULT_FRAME_FIELD;
  // Every active per-frame field — the stream fetches + seeds all of them so the
  // engine (and the sidebar/canvas/timeline that read it) sees more than just
  // the primary detection field (e.g. polylines, masked detections).
  const labelFields = useFrameLabelFields();

  const frameRate = useModalSampleFrameRate(sample);
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
  const key = `${sampleId}|${dataset}|${slice ?? ""}|${
    dynamicGroup ?? ""
  }|${frameRate}|${frameCount}|${fieldSetKey}`;

  return (
    <FrameLabelsRegistration
      key={key}
      sampleId={sampleId}
      dataset={dataset}
      view={view}
      dynamicGroup={dynamicGroup}
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
  dynamicGroup: string | null;
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
      dynamicGroup: props.dynamicGroup,
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

  // The stream holds mask borrows in the process-wide bitmap cache; nothing
  // else can return them after unmount, so this teardown is what keeps a
  // sample change from pinning cache entries forever. (A StrictMode re-mount
  // is fine: the next commit's hold window simply re-borrows.)
  useEffect(() => () => stream.dispose(), [stream]);

  usePlaybackStream(streamRef.current);

  // Registration alone leaves the stream dormant, which the engine skips
  // entirely — no readiness barrier, no prefetch. Nothing renders from its
  // published snapshot (the engine owns labels; this stream seeds them via
  // `subscribeToEdits`), so activate it explicitly: the clock must wait on
  // label readiness rather than run ahead of the overlays.
  useActivateStream(LABELS_STREAM_ID);

  // Publish so consumers above the surface reach it via useFrameLabelsStream.
  usePublishFrameLabelsStream(streamRef.current);

  // Prefetch + seek t=0 so overlays paint on first load, not on first play.
  useWarmupThenSeek(streamRef.current);

  return <>{children}</>;
};

/**
 * Derive TD tracks from the engine — the authoritative, reactive TD source.
 * Reading it directly means a `support` / label edit (sidebar or timeline drag)
 * rebuilds the rows immediately. The prior scene-overlay read only re-derived on
 * an overlay add/remove, so an in-place support edit left the timeline stale;
 * `useTemporalOverlaySync` keeps the canvas overlays in step from the same source.
 */
function useTemporalDetectionTracks(
  sample: ModalSample | undefined,
  resolveColor: TemporalDetectionColorResolver,
): Track[] {
  const temporalSample = useEngineTemporalSample();
  const frameRate = useModalSampleFrameRate(sample);
  const visible = useVisibleLabelSchemas();

  return useMemo(() => {
    if (
      frameRate === undefined ||
      !Number.isFinite(frameRate) ||
      frameRate <= 0
    ) {
      return [];
    }

    // Only fields visible in the sidebar — a deactivated TD field drops its
    // timeline rows, matching the canvas + sidebar.
    const visibleSample: Record<string, unknown> = {};
    for (const [path, value] of Object.entries(temporalSample)) {
      if (visible.has(path)) {
        visibleSample[path] = value;
      }
    }

    return buildTemporalDetectionTracks({
      sample: visibleSample,
      fps: frameRate,
      resolveColor,
    });
  }, [temporalSample, frameRate, resolveColor, visible]);
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
  const fps = useModalSampleFrameRate(sample);
  const snapStepSec =
    Number.isFinite(fps) && fps && fps > 0 ? 1 / fps : undefined;

  // The split boundary, captured when the track's context menu OPENS — not read
  // live in the menu item's handler, because clicking a menu item seeks the
  // timeline to the track's start, racing the gesture (explicit payload over
  // implicit context).
  const splitFrameRef = useRef(1);

  // Merge targets, bucketed by the pair that gates them — same class, same
  // field. Grouping once turns the per-row lookup into a map hit; the previous
  // shape was a flat list every row re-filtered, which is O(tracks) per
  // rendered row and showed up as scroll cost on big samples.
  const mergeCandidatesByGroup = useMemo(() => {
    const groups = new Map<string, MergeCandidate[]>();

    for (const track of objectTracks) {
      if (parseSubTrackId(track.id)) continue;

      const key = mergeGroupKey(
        objectTrackPathOf(track),
        objectTrackClassOf(track),
      );
      const candidate: MergeCandidate = {
        id: track.id,
        label: track.label,
        startSec: trackStartSec(track),
      };
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(candidate);
      } else {
        groups.set(key, [candidate]);
      }
    }

    return groups;
  }, [objectTracks]);

  /**
   * Row decorations, keyed on the track object and validated against the
   * interaction decoration it was built from.
   *
   * `baseDecorate` changes identity on every hover and selection move (it
   * closes over the id sets), which would otherwise re-mint every mounted
   * row's decoration on the hottest interaction there is. It hands back a
   * stable object per row when that row's own state hasn't changed, so
   * comparing it is enough to reuse the whole decoration — and the memoized
   * rows then skip re-rendering. Everything else the decoration reads resets
   * the cache through the dependency list below.
   */
  const cache = useMemo(
    () =>
      new WeakMap<
        Track,
        { base: BaseTrackDecoration; built: TrackDecoration }
      >(),
    [
      fps,
      snapStepSec,
      actions,
      stream,
      getCurrentFrame,
      mergeCandidatesByGroup,
      expansion,
      expandableParentIds,
    ],
  );

  return useCallback(
    (track: Track): TrackDecoration => {
      // A sub-track row links its hover / selection to the PARENT instance and
      // renders as an indented child; it owns no presence-bar edits.
      const sub = parseSubTrackId(track.id);
      const base = sub
        ? baseDecorate({ ...track, id: sub.parentId })
        : baseDecorate(track);

      const cached = cache.get(track);
      if (cached && cached.base === base) return cached.built;

      const remember = (built: TrackDecoration): TrackDecoration => {
        cache.set(track, { base, built });
        return built;
      };

      if (sub) {
        const parentLink = base;
        return remember({
          ...parentLink,
          expansionGutter: true,
          depth: 1,
          isChild: true,
          height: SUB_TRACK_ROW_HEIGHT,
        });
      }

      if (!fps) {
        return remember({ ...base, expansionGutter: true });
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
          // the track's own frames field — the per-frame ops address it directly,
          // so a track on a non-primary field still deletes / splits / merges
          trackPath: objectTrackPathOf(track),
          // merge only into a different track OF THE SAME CLASS on the SAME
          // field (a cross-field merge is meaningless), capped so a class with
          // thousands of instances doesn't build — or show — a menu that long
          ...mergeTargetsFor(mergeCandidatesByGroup, track),
        });

        if (!expandableParentIds.has(track.id)) {
          return remember({ ...decorated, expansionGutter: true });
        }

        return remember({
          ...decorated,
          expansionGutter: true,
          expandable: true,
          expanded: expansion.isExpanded(track.id),
          onToggleExpand: () => expansion.toggle(track.id),
        });
      }

      // Object track with no stream yet: can't wire frame edits — base only.
      if (isObjectTrack) {
        return remember({ ...base, expansionGutter: true });
      }

      return remember({
        ...decorateTemporalDetectionTrack({
          tdEvent: tdEvent as TemporalDetectionEventData,
          base,
          snapStepSec,
          fps,
          actions,
        }),
        expansionGutter: true,
      });
    },
    [
      cache,
      baseDecorate,
      fps,
      snapStepSec,
      actions,
      stream,
      getCurrentFrame,
      mergeCandidatesByGroup,
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
export const FrameLabelsTracks: React.FC<{
  sample?: ModalSample;
  /** Cap on the timeline drawer body (px); it scrolls internally past this. */
  maxSize?: number;
}> = ({ sample, maxSize }) => {
  const { resolveObjectColor, resolveTemporalDetectionColor } =
    useTrackColorResolvers();

  // Persisted globally so switching samples keeps the drawer open/closed.
  const [drawerOpen, setDrawerOpen] = useTimelineDrawerOpen();

  // Persist pin state per video (dataset + sample) so reopening the same
  // sample restores which tracks the user pinned to the timeline.
  const dataset = useDatasetName();
  const sampleId = useModalSampleId();
  const persistKey =
    dataset && sampleId
      ? `fo-va-pinned-tracks:${dataset}:${sampleId}`
      : undefined;

  // Dynamic attributes are declared per field, so resolve them per-path when
  // building tracks — a single primary-field lookup leaks one field's dynamic
  // attributes onto every other field's tracks.
  const getDynamicAttributeNames = useDynamicAttributeNamesGetter();

  const { tracks: frameTracks, resolved: frameTracksResolved } =
    useFrameDerivedTracks(resolveObjectColor, getDynamicAttributeNames);
  const temporalDetectionTracks = useTemporalDetectionTracks(
    sample,
    resolveTemporalDetectionColor,
  );

  // Readiness for the data-timeline-loaded test seam: schemas must have
  // landed (TD/frame fields are schema-gated), and the frame index must
  // have resolved unless there are no frame fields to index.
  const schemasLoaded = useLabelSchemasLoaded();
  const visibleSchemas = useVisibleLabelSchemas();
  const hasFrameFields = useMemo(
    () => [...visibleSchemas].some((path) => path.startsWith("frames.")),
    [visibleSchemas],
  );
  const timelineLoaded =
    schemasLoaded && (frameTracksResolved || !hasFrameFields);

  // Publish readiness so the surface's coordinated reveal (scene + timeline
  // together) can wait on real tracks — see `surfaceReveal`.
  const setTimelineLoaded = useSetTimelineLoaded();
  useEffect(() => {
    setTimelineLoaded(timelineLoaded);
    return () => setTimelineLoaded(false);
  }, [timelineLoaded, setTimelineLoaded]);

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

  // Bootstrap on frame-tracks-resolved, not `tracks.length`: TD tracks resolve
  // synchronously and would otherwise trip the empty→ready flip before frame
  // tracks land, leaving frame tracks unpinned.
  const ready = frameTracksResolved;

  // Filled by TimelineWithTracks; the drawer is virtualized, so revealing a
  // row has to go through the list rather than the DOM.
  const timelineScroller = useRef<TimelineTracksScroller | null>(null);
  useScrollTrackToAnchor(timelineScroller);
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
      autoPinNewTracks={false}
      persistKey={persistKey}
    >
      <TimelineWithTracks
        decorateTrack={decorateTrack}
        scrollerRef={timelineScroller}
        extraControls={<VideoAnnotationToolbar />}
        loaded={timelineLoaded}
        maxSize={maxSize}
        drawerOpen={drawerOpen}
        onDrawerOpenChange={setDrawerOpen}
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
  trackPath,
  mergeTargets,
  omitted,
}: {
  track: Track;
  base: BaseTrackDecoration;
  snapStepSec: number | undefined;
  fps: number;
  totalFrames: number;
  actions: VideoSurfaceActions;
  getCurrentFrame: () => number;
  splitFrameRef: React.MutableRefObject<number>;
  trackPath: string | null;
  mergeTargets: { id: string; label: string }[];
  /** Same-class targets dropped by the cap, so the menu can say so. */
  omitted: number;
}): TrackDecoration {
  // Address the track's own frames field so a non-primary-field track still
  // operates; `undefined` falls back to the stream's primary field in the action.
  const fieldPath = trackPath ?? undefined;

  const menuItems: TrackEventMenuItem[] = [
    {
      label: "Delete track",
      destructive: true,
      onSelect: () => actions.deleteTrack(track.id, fieldPath),
    },
    {
      // deletes only the frame captured when the menu opened (see onContextMenu);
      // a no-op when the track has no occurrence on that frame
      label: "Delete current frame",
      destructive: true,
      onSelect: () =>
        actions.trimTrack(track.id, [splitFrameRef.current], fieldPath),
    },
    {
      // splits at the frame captured when the menu opened (see onContextMenu)
      label: "Split at playhead",
      onSelect: () =>
        actions.splitTrack(track.id, splitFrameRef.current, fieldPath),
    },
    ...mergeTargets.map((target) => ({
      label: `Merge into ${target.label}`,
      onSelect: () => actions.mergeTracks(track.id, target.id, fieldPath),
    })),
  ];

  // Say so rather than let the list look complete — a silently truncated menu
  // reads as "there is nothing else to merge into".
  if (omitted > 0) {
    menuItems.push({
      label: `…and ${omitted} more not shown`,
      disabled: true,
      onSelect: () => undefined,
    });
  }

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
        fieldPath,
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
  fieldPath,
}: {
  track: Track;
  eventIndex: number;
  newStartSec: number;
  newEndSec: number;
  mode: "resize-start" | "resize-end" | "move";
  fps: number;
  totalFrames: number;
  actions: VideoSurfaceActions;
  /** The track's own frames field, so a non-primary track edits in place. */
  fieldPath?: string;
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
      actions.extendTrack(
        track.id,
        edit.sourceFrame,
        edit.targetFrames,
        undefined,
        fieldPath,
      );
      break;
    case "trim":
      actions.trimTrack(track.id, edit.frames, fieldPath);
      break;
    case "shift":
      actions.shiftTrack(track.id, edit.frames, edit.delta, fieldPath);
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
