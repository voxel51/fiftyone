import type { AnnotationEngine } from "@fiftyone/annotation";
import type { Track, TrackEvent } from "@fiftyone/playback";
import type { LabelData } from "@fiftyone/utilities";
import { isEqual } from "lodash";
import {
  mergeAttributeRuns,
  mergePresence,
  type Segment,
  type ValueRun,
} from "./segments";

/** The engine read surface this builder needs — one frame's labels at a time. */
export type FrameLabelReader = Pick<AnnotationEngine, "listLabels">;

/**
 * Payload attached to each object track's {@link TrackEvent.data}. Carries the
 * engine field path the row's instance lives on so a row click / hover can
 * address the right `(path, instanceId)` ref — tracks span multiple frame
 * fields (detections, polylines), so the path can't be assumed.
 */
export interface ObjectTrackEventData {
  path: string;
}

/**
 * The engine field path an object track's instance lives on, read off its
 * event payload. `null` for a TD row (whose data is a
 * {@link TemporalDetectionEventData}) or any row without the payload.
 */
export const objectTrackPathOf = (track: Track): string | null => {
  const data = track.events[0]?.data as ObjectTrackEventData | undefined;
  return typeof data?.path === "string" ? data.path : null;
};

interface InstanceState {
  /** Class label observed for this instance (e.g. "person"). */
  classLabel: string;
  /** Engine field path the instance lives on (e.g. `frames.polylines`). */
  path: string;
  /**
   * Persisted track index carried on the underlying detection, when
   * present. Undefined for freshly-drawn instances that haven't been
   * numbered.
   */
  persistedIndex?: number;
  /**
   * Display ordinal used for the row label text. Equals
   * `persistedIndex` when set; otherwise assigned at build time as the
   * next free integer above the per-class max so the demo UI always
   * has a readable "person 3" / "person 4" label.
   */
  displayIndex: number;
  /**
   * The underlying detection's `Instance` reference, when present. Carried
   * so the row color hashes on the same `instance._id` the overlay does
   * under color-by-instance.
   */
  instance?: { _cls: "Instance"; _id?: string } | null;
  /** Whether the instance was present in the most recent frame. */
  inFrame: boolean;
  /** Start time (sec) of the currently-open interval, if any. */
  currentStart: number | null;
  /** Closed presence intervals. */
  intervals: Array<{ start: number; end: number }>;
  /** Frame start times (sec) where this instance has `keyframe: true`. */
  keyframeTimes: number[];
  /**
   * Per declared-dynamic attribute, its value on each frame the instance is
   * present, in frame order. Drives the collapsible sub-track rows: coalescing
   * consecutive-equal values into segments shows where the attribute changes
   * within the track.
   */
  attributeFrames: Map<string, Array<{ frame: number; value: unknown }>>;
  /**
   * Per declared-dynamic attribute, its coalesced value segments (sec-based) —
   * the finalized form the sub-track rows render. Built from `attributeFrames`
   * on the walk path, or from the index ⊕ overlay merge on the index path.
   */
  attributeSegments: Map<string, AttributeSegment[]>;
}

/**
 * Minimal label-shape passed to {@link BuildPerInstanceTracksInput.resolveColor}.
 * Mirrors the fields `getLabelColorFromContext` reads, so the color resolves
 * the same way it would for the matching overlay.
 *
 * `index` and `instance` must be the *underlying detection's* values (not a
 * synthetic display ordinal), because color-by-instance hashes on
 * `${label}-${index}-${instance._id}` — passing the display ordinal or
 * dropping the instance would desync the row color from the bbox overlay.
 */
export interface PerInstanceLabel {
  label: string;
  index?: number;
  instance?: { _cls: "Instance"; _id?: string } | null;
}

/** Resolve a row's color from its label and the field path it lives on. */
export type PerInstanceColorResolver = (
  label: PerInstanceLabel,
  path: string,
) => string;

export interface BuildPerInstanceTracksInput {
  engine: FrameLabelReader;
  /** Sample whose frame labels back the timeline. */
  sample: string;
  /**
   * Frame-agnostic label field paths to project (e.g. `frames.detections`,
   * `frames.polylines`). Each instance keys by its `instance._id`, unique
   * across fields, so the per-field walks merge into one set of tracks.
   */
  paths: string[];
  /** Total frames in the clip — the walk range `[1, totalFrames]`. */
  totalFrames: number;
  /** Frame rate, for the frame↔seconds mapping. */
  fps: number;
  resolveColor: PerInstanceColorResolver;
  /**
   * Schema-declared dynamic attribute names. Each one that appears on an
   * instance gets a collapsible sub-track row beneath its parent object track,
   * its value segmented along the timeline. Empty (the default) yields no
   * sub-tracks, so non-dynamic schemas are unaffected.
   */
  dynamicAttributes?: string[];
}

/** Track identity is `instance._id`; fall back to the doc `_id` (legacy). */
const addressIdOf = (label: LabelData): string => {
  const instance = label.instance as { _id?: string } | undefined;
  return instance?._id ?? label._id;
};

const labelOf = (label: LabelData): string =>
  (label.label as string | undefined) || "unknown";

const indexOf = (label: LabelData): number | undefined =>
  label.index as number | undefined;

const instanceOf = (
  label: LabelData,
): { _cls: "Instance"; _id?: string } | null =>
  (label.instance as { _cls: "Instance"; _id?: string } | null) ?? null;

/**
 * Walk every frame in `[1, totalFrames]`, group the engine's per-frame labels
 * by their engine `instanceId` (`instance._id`, or the doc `_id` for legacy
 * instance-less detections), and emit one {@link Track} per tracked instance
 * whose events are the contiguous presence intervals.
 *
 * The track id IS the engine `instanceId`, so the timeline links to engine
 * interaction with no synthetic-id mapping. Legacy instance-less detections
 * carry a distinct doc `_id` per frame and so fragment into single-frame rows
 * until edited into a real instance.
 *
 * Row labels combine the class with a per-class display ordinal (e.g.
 * "person 5"). For detections that already carry a persisted `index`, that
 * number is used; otherwise the ordinal is the next free integer above the
 * per-class max. Row color is resolved from the class so each row matches the
 * colour of its bbox overlay.
 *
 * Requires the engine to project the whole clip; trigger a full warmup of the
 * `/frames` seed first so every frame is loaded.
 */
export function buildPerInstanceTracks({
  engine,
  sample,
  paths,
  totalFrames,
  fps,
  resolveColor,
  dynamicAttributes = [],
}: BuildPerInstanceTracksInput): Track[] {
  if (totalFrames < 1 || !Number.isFinite(fps) || fps <= 0) {
    return [];
  }

  const states = accumulatePresence(
    engine,
    sample,
    paths,
    totalFrames,
    fps,
    dynamicAttributes,
  );
  return statesToTracks(states, resolveColor, dynamicAttributes);
}

/** One tracked instance's server-side presence distribution (no payloads). */
export interface IndexInstance {
  instanceId: string;
  classLabel: string | null;
  persistedIndex: number | null;
  instance: { _cls: "Instance"; _id?: string } | null;
  /** Run-length-encoded `[startFrame, endFrame]` presence runs. */
  segments: Array<[number, number]>;
  /** Frame numbers carrying a `keyframe` flag. */
  keyframes: number[];
  /**
   * Per declared-dynamic attribute, RLE `[startFrame, endFrame, value]` value
   * runs across the instance's presence. Present only when the index was
   * fetched with `dynamicAttributes`; consumed by the dynamic-attribute
   * sub-track read model (not the presence/keyframe timeline).
   */
  attributeSegments?: Record<string, Array<[number, number, unknown]>>;
}

/** Live engine labels for the dirty (edited) frames, keyed by frame number. */
export type FrameOverlay = Map<number, LabelData[]>;

export interface BuildTracksFromIndexInput {
  /** Engine field path these entries live on (e.g. `frames.detections`). */
  path: string;
  /** Server baseline distribution for the field, one entry per instance. */
  index: IndexInstance[];
  /** The engine's edited frames — these shadow the baseline frame-for-frame. */
  overlay: FrameOverlay;
  /** Frame rate, for the frame↔seconds mapping. */
  fps: number;
  resolveColor: PerInstanceColorResolver;
  /** Schema-declared dynamic attribute names → collapsible sub-track rows. */
  dynamicAttributes?: string[];
}

/**
 * Build per-instance timeline tracks from the server index merged with the
 * engine's edited-frame overlay. The index supplies the whole-clip presence
 * baseline; the overlay supplies the authoritative presence at the (small)
 * set of dirty frames, so in-session edits — new tracks, deletions, extended
 * presence — reflect immediately without re-fetching the index or walking the
 * whole clip. The merge stays in segment space (see {@link mergePresence} and
 * {@link mergeAttributeRuns}).
 */
export function buildTracksFromIndex({
  path,
  index,
  overlay,
  fps,
  resolveColor,
  dynamicAttributes = [],
}: BuildTracksFromIndexInput): Track[] {
  if (!Number.isFinite(fps) || fps <= 0) {
    return [];
  }

  const states = mergeIndexWithOverlay(
    index,
    overlay,
    fps,
    path,
    dynamicAttributes,
  );
  return statesToTracks(states, resolveColor, dynamicAttributes);
}

/** Shape the accumulated states into sorted, colored timeline tracks. */
function statesToTracks(
  states: Map<string, InstanceState>,
  resolveColor: PerInstanceColorResolver,
  dynamicAttributes: readonly string[],
): Track[] {
  assignDisplayOrdinals(states);

  const parents: Track[] = [];
  const childrenByParent = new Map<string, Track[]>();
  for (const [id, state] of states) {
    if (state.intervals.length === 0) {
      continue;
    }

    const parent = toTrack(id, state, resolveColor);
    parents.push(parent);

    const children = buildSubTracks(parent, state, dynamicAttributes);
    if (children.length > 0) {
      childrenByParent.set(id, children);
    }
  }

  // Emit each parent immediately followed by its sub-tracks so a child row
  // always sits under its parent in the flat list the timeline renders.
  const ordered: Track[] = [];
  for (const parent of sortByClassThenOrdinal(parents, states)) {
    ordered.push(parent);
    ordered.push(...(childrenByParent.get(parent.id) ?? []));
  }

  return ordered;
}

/**
 * Reconcile the index baseline with the dirty-frame overlay into per-instance
 * states. For each instance the merged presence is `baseline − dirtyFrames +
 * (frames the overlay still has it)`; keyframes likewise prefer the overlay at
 * dirty frames; class/index/instance prefer the live overlay label when the
 * instance was touched this session, else the baseline.
 */
function mergeIndexWithOverlay(
  index: IndexInstance[],
  overlay: FrameOverlay,
  fps: number,
  path: string,
  dynamicAttributes: readonly string[],
): Map<string, InstanceState> {
  const dirtySorted = [...overlay.keys()].sort((a, b) => a - b);
  const dirtySet = new Set(dirtySorted);

  const presentByInstance = new Map<string, number[]>();
  const liveLabelByInstance = new Map<string, LabelData>();
  const dirtyKeyframesByInstance = new Map<string, number[]>();
  // Per instance, per dynamic attr, the live overlay value at each dirty frame.
  const dirtyAttrsByInstance = new Map<
    string,
    Map<string, Map<number, unknown>>
  >();

  for (const frame of dirtySorted) {
    for (const label of overlay.get(frame) ?? []) {
      const id = addressIdOf(label);
      pushTo(presentByInstance, id, frame);

      if (!liveLabelByInstance.has(id)) {
        liveLabelByInstance.set(id, label);
      }

      if (label.keyframe) {
        pushTo(dirtyKeyframesByInstance, id, frame);
      }

      recordDirtyAttrValues(
        dirtyAttrsByInstance,
        id,
        label,
        frame,
        dynamicAttributes,
      );
    }
  }

  const baselineById = new Map(index.map((entry) => [entry.instanceId, entry]));
  const ids = new Set<string>([
    ...baselineById.keys(),
    ...presentByInstance.keys(),
  ]);

  const states = new Map<string, InstanceState>();
  for (const id of ids) {
    const baseline = baselineById.get(id);
    const baseSegments: Segment[] = baseline ? baseline.segments : [];
    const present = presentByInstance.get(id) ?? [];

    const segments = mergePresence(baseSegments, dirtySorted, present);
    if (segments.length === 0) {
      continue;
    }

    states.set(
      id,
      indexInstanceState({
        baseline,
        live: liveLabelByInstance.get(id),
        segments,
        baselineKeyframes: baseline?.keyframes ?? [],
        dirtyKeyframes: dirtyKeyframesByInstance.get(id) ?? [],
        dirtySet,
        fps,
        path,
        dynamicAttributes,
        dirtySorted,
        dirtyAttrs: dirtyAttrsByInstance.get(id),
      }),
    );
  }

  return states;
}

function pushTo(map: Map<string, number[]>, key: string, value: number): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }

  map.set(key, [value]);
}

/** Build one instance's state from its merged segments + class/keyframe sources. */
function indexInstanceState({
  baseline,
  live,
  segments,
  baselineKeyframes,
  dirtyKeyframes,
  dirtySet,
  fps,
  path,
  dynamicAttributes,
  dirtySorted,
  dirtyAttrs,
}: {
  baseline: IndexInstance | undefined;
  live: LabelData | undefined;
  segments: Segment[];
  baselineKeyframes: number[];
  dirtyKeyframes: number[];
  dirtySet: Set<number>;
  fps: number;
  path: string;
  dynamicAttributes: readonly string[];
  dirtySorted: readonly number[];
  dirtyAttrs: Map<string, Map<number, unknown>> | undefined;
}): InstanceState {
  const intervals = segments.map(([start, end]) => ({
    start: (start - 1) / fps,
    end: (end - 1) / fps,
  }));

  const keyframeFrames = [
    ...baselineKeyframes.filter((frame) => !dirtySet.has(frame)),
    ...dirtyKeyframes,
  ].sort((a, b) => a - b);

  const keyframeTimes = keyframeFrames.map((frame) => (frame - 1) / fps);

  // Merge each dynamic attr's baseline value runs (from the index) with the
  // overlay's live values at the dirty frames, then map to sec-based segments.
  const attributeSegments = new Map<string, AttributeSegment[]>();
  for (const attr of dynamicAttributes) {
    const baselineRuns: ValueRun[] = baseline?.attributeSegments?.[attr] ?? [];
    const dirtyValues = dirtyAttrs?.get(attr) ?? new Map<number, unknown>();
    if (baselineRuns.length === 0 && dirtyValues.size === 0) {
      continue;
    }

    const merged = mergeAttributeRuns(baselineRuns, dirtySorted, dirtyValues);
    if (merged.length > 0) {
      attributeSegments.set(attr, toAttributeSegments(merged, fps));
    }
  }

  return {
    classLabel: live ? labelOf(live) : baseline?.classLabel || "unknown",
    path,
    persistedIndex: live
      ? indexOf(live)
      : (baseline?.persistedIndex ?? undefined),
    instance: live ? instanceOf(live) : (baseline?.instance ?? null),
    displayIndex: 0,
    inFrame: false,
    currentStart: null,
    intervals,
    keyframeTimes,
    attributeFrames: new Map(),
    attributeSegments,
  };
}

/** Close a state's currently-open presence interval at `endSec`. */
function closeInterval(state: InstanceState, endSec: number): void {
  if (state.currentStart === null) {
    return;
  }

  state.intervals.push({ start: state.currentStart, end: endSec });
  state.currentStart = null;
  state.inFrame = false;
}

function newInstanceState(label: LabelData, path: string): InstanceState {
  return {
    classLabel: labelOf(label),
    path,
    persistedIndex: indexOf(label),
    instance: instanceOf(label),
    // Placeholder — overwritten by `assignDisplayOrdinals` once every
    // state is known and per-class ordinals can be computed.
    displayIndex: 0,
    inFrame: false,
    currentStart: null,
    intervals: [],
    keyframeTimes: [],
    attributeFrames: new Map(),
    attributeSegments: new Map(),
  };
}

/**
 * Walk every frame and group the engine's labels into per-instance presence
 * intervals + keyframe times. Intervals still open at clip end are closed.
 */
function accumulatePresence(
  engine: FrameLabelReader,
  sample: string,
  paths: string[],
  totalFrames: number,
  fps: number,
  dynamicAttributes: readonly string[],
): Map<string, InstanceState> {
  const states = new Map<string, InstanceState>();

  for (let frame = 1; frame <= totalFrames; frame++) {
    const frameStartSec = (frame - 1) / fps;
    const present = new Set<string>();

    for (const path of paths) {
      for (const label of engine.listLabels({ sample, path, frame })) {
        const id = addressIdOf(label);
        present.add(id);

        let state = states.get(id);
        if (!state) {
          state = newInstanceState(label, path);
          states.set(id, state);
        }

        if (!state.inFrame) {
          state.currentStart = frameStartSec;
          state.inFrame = true;
        }

        if (label.keyframe) {
          state.keyframeTimes.push(frameStartSec);
        }

        recordDynamicValues(state, label, frame, dynamicAttributes);
      }
    }

    // Close any instance that was present last frame but not now.
    for (const [id, state] of states) {
      if (!present.has(id) && state.inFrame) {
        closeInterval(state, frameStartSec);
      }
    }
  }

  const clipEndSec = totalFrames / fps;
  for (const state of states.values()) {
    closeInterval(state, clipEndSec);

    // Finalize the per-frame accumulator into coalesced value segments.
    for (const [attr, records] of state.attributeFrames) {
      state.attributeSegments.set(attr, segmentAttribute(records, fps));
    }
  }

  return states;
}

/**
 * Set each state's `displayIndex`. Persisted indexes are honored as-is so
 * existing tracked data keeps its familiar numbers; instance-only boxes
 * (typically freshly-drawn) get the next free integer above the per-class
 * max. Mutates the states in place.
 */
function assignDisplayOrdinals(states: Map<string, InstanceState>): void {
  const classCounters = new Map<string, number>();

  for (const state of states.values()) {
    if (state.persistedIndex === undefined) {
      continue;
    }

    const cur = classCounters.get(state.classLabel) ?? 0;
    if (state.persistedIndex > cur) {
      classCounters.set(state.classLabel, state.persistedIndex);
    }
  }

  for (const state of states.values()) {
    if (state.persistedIndex !== undefined) {
      state.displayIndex = state.persistedIndex;
      continue;
    }

    const next = (classCounters.get(state.classLabel) ?? 0) + 1;
    state.displayIndex = next;
    classCounters.set(state.classLabel, next);
  }
}

/** Build the timeline {@link Track} for one accumulated instance state. */
function toTrack(
  id: string,
  state: InstanceState,
  resolveColor: PerInstanceColorResolver,
): Track {
  // Every event carries the field path so a row's click / hover resolves the
  // correct `(path, instanceId)` ref regardless of which frame field it's on.
  const data: ObjectTrackEventData = { path: state.path };

  const events: TrackEvent[] = [
    // `resizable: true` opts each presence bar into in-place edit — drag
    // handles to extend/trim the track, drag the body to shift it. Inert
    // without an `onEventEdit`, so non-object timelines are unaffected.
    ...state.intervals.map(
      ({ start, end }): TrackEvent & { resizable: true } => ({
        startSec: start,
        endSec: end,
        label: "in frame",
        resizable: true,
        data,
      }),
    ),
    // Point events render as diamond markers on top of the presence bar
    // via `TimelineTrack`'s no-`endSec` branch.
    ...state.keyframeTimes.map((startSec) => ({
      startSec,
      label: "Keyframe",
      data,
    })),
  ];

  return {
    id,
    label: `${state.classLabel} ${state.displayIndex}`,
    description: `Tracked "${state.classLabel}" (track ${state.displayIndex})`,
    color: resolveColor(
      {
        label: state.classLabel,
        index: state.persistedIndex,
        instance: state.instance,
      },
      state.path,
    ),
    events,
  };
}

/**
 * Order tracks by class then display ordinal — keeps instances of the same
 * class adjacent and the row order reproducible across runs.
 */
function sortByClassThenOrdinal(
  tracks: Track[],
  states: Map<string, InstanceState>,
): Track[] {
  return tracks.sort((a, b) => {
    const sa = states.get(a.id)!;
    const sb = states.get(b.id)!;

    if (sa.classLabel !== sb.classLabel) {
      return sa.classLabel.localeCompare(sb.classLabel);
    }

    return sa.displayIndex - sb.displayIndex;
  });
}

/** Separator between a parent track id and the dynamic-attribute sub-track. */
const SUB_TRACK_SEPARATOR = "::";

/** Mint a sub-track id from its parent track id and the attribute name. */
export const subTrackId = (parentId: string, attr: string): string =>
  `${parentId}${SUB_TRACK_SEPARATOR}${attr}`;

/**
 * Parse a sub-track id back into `{ parentId, attr }`, or `null` when the id is
 * an ordinary parent / temporal-detection track (no separator). Parent ids are
 * Mongo `instance._id`s, so the separator never collides.
 */
export const parseSubTrackId = (
  id: string,
): { parentId: string; attr: string } | null => {
  const at = id.indexOf(SUB_TRACK_SEPARATOR);
  if (at === -1) {
    return null;
  }

  return {
    parentId: id.slice(0, at),
    attr: id.slice(at + SUB_TRACK_SEPARATOR.length),
  };
};

/** A contiguous run of one dynamic-attribute value across a track's frames. */
export interface AttributeSegment {
  startSec: number;
  endSec: number;
  value: unknown;
}

/**
 * Record each declared-dynamic attribute's value on this present frame. Absent
 * keys record `null` so an attribute that's set on some frames and not others
 * segments cleanly (a missing value is a distinct segment, not a gap).
 */
function recordDynamicValues(
  state: InstanceState,
  label: LabelData,
  frame: number,
  dynamicAttributes: readonly string[],
): void {
  for (const attr of dynamicAttributes) {
    const value =
      attr in label ? (label as Record<string, unknown>)[attr] : null;

    let records = state.attributeFrames.get(attr);
    if (!records) {
      records = [];
      state.attributeFrames.set(attr, records);
    }

    records.push({ frame, value });
  }
}

/**
 * Record each dynamic attribute's overlay value at a dirty frame, keyed by
 * instance → attr → frame. The index path's analog of {@link recordDynamicValues}:
 * the overlay re-reads the whole frame, so this captures every present
 * instance's live value (absent attr → `null`, matching the baseline's "unset"
 * runs) for {@link mergeAttributeRuns} to splice onto the baseline.
 */
function recordDirtyAttrValues(
  byInstance: Map<string, Map<string, Map<number, unknown>>>,
  id: string,
  label: LabelData,
  frame: number,
  dynamicAttributes: readonly string[],
): void {
  if (dynamicAttributes.length === 0) {
    return;
  }

  let byAttr = byInstance.get(id);
  if (!byAttr) {
    byAttr = new Map();
    byInstance.set(id, byAttr);
  }

  for (const attr of dynamicAttributes) {
    const value =
      attr in label ? (label as Record<string, unknown>)[attr] : null;

    let byFrame = byAttr.get(attr);
    if (!byFrame) {
      byFrame = new Map();
      byAttr.set(attr, byFrame);
    }

    byFrame.set(frame, value);
  }
}

/** Map frame-based value runs to the sec-based segments the rows render. */
const toAttributeSegments = (
  runs: ValueRun[],
  fps: number,
): AttributeSegment[] =>
  runs.map(([startFrame, endFrame, value]) => ({
    startSec: (startFrame - 1) / fps,
    endSec: endFrame / fps,
    value,
  }));

/**
 * Coalesce a dynamic attribute's per-frame values into value segments. A new
 * segment opens whenever the value changes OR the frame isn't contiguous with
 * the previous one (a presence gap), so segments never bridge frames where the
 * instance was absent. Frames span `[(frame - 1) / fps, frame / fps]`, matching
 * the parent's presence-interval mapping. Records must be in frame order.
 */
export function segmentAttribute(
  records: ReadonlyArray<{ frame: number; value: unknown }>,
  fps: number,
): AttributeSegment[] {
  const segments: AttributeSegment[] = [];

  let startFrame: number | null = null;
  let endFrame = 0;
  let runValue: unknown;

  const flush = () => {
    if (startFrame === null) {
      return;
    }

    segments.push({
      startSec: (startFrame - 1) / fps,
      endSec: endFrame / fps,
      value: runValue,
    });
  };

  for (const { frame, value } of records) {
    const extends_ =
      startFrame !== null && frame === endFrame + 1 && isEqual(value, runValue);

    if (extends_) {
      endFrame = frame;
      continue;
    }

    flush();
    startFrame = frame;
    endFrame = frame;
    runValue = value;
  }

  flush();
  return segments;
}

/**
 * Build one sub-track per declared-dynamic attribute the instance carries. A
 * declared attribute always gets a row (uniform → a single full-presence
 * segment); each value segment is colored by its value so changes read at a
 * glance, with the value as the segment label.
 */
function buildSubTracks(
  parent: Track,
  state: InstanceState,
  dynamicAttributes: readonly string[],
): Track[] {
  const tracks: Track[] = [];

  for (const attr of dynamicAttributes) {
    const segments = state.attributeSegments.get(attr);
    if (!segments || segments.length === 0) {
      continue;
    }

    tracks.push(toSubTrack(parent, attr, segments, state.path));
  }

  return tracks;
}

/** Build the sub-track {@link Track} for one dynamic attribute's segments. */
function toSubTrack(
  parent: Track,
  attr: string,
  segments: AttributeSegment[],
  path: string,
): Track {
  // Carry the parent's field path on every event so a sub-track row resolves the
  // parent's `(path, instanceId)` ref when its row is clicked — selection is
  // path-aware (tracks span multiple frame fields), and a row with no path
  // selects nothing. `value` drives the per-segment seek/label.
  const events: TrackEvent[] = segments.map(({ startSec, endSec, value }) => ({
    startSec,
    endSec,
    label: renderAttributeValue(value),
    color: hashColor(value),
    data: { value, path },
  }));

  return {
    id: subTrackId(parent.id, attr),
    label: attr,
    description: `Dynamic attribute "${attr}" of ${parent.label}`,
    // Fallback only — each segment carries its own value-hashed color.
    color: parent.color,
    events,
  };
}

/** Human-readable rendering of an attribute value for a segment label. */
function renderAttributeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "unset";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

/**
 * Deterministic color per attribute value so equal values share a color and
 * changes stand out. `null` / `undefined` ("unset") render as a neutral gray.
 */
function hashColor(value: unknown): string {
  if (value === null || value === undefined) {
    return "hsl(0, 0%, 45%)";
  }

  const key = renderAttributeValue(value);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }

  return `hsl(${hash % 360}, 65%, 55%)`;
}
