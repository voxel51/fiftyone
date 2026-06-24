import type { AnnotationEngine } from "@fiftyone/annotation";
import type { Track, TrackEvent } from "@fiftyone/playback";
import type { LabelData } from "@fiftyone/utilities";
import { isEqual } from "lodash";

/** The engine read surface this builder needs — one frame's labels at a time. */
export type FrameLabelReader = Pick<AnnotationEngine, "listLabels">;

interface InstanceState {
  /** Class label observed for this instance (e.g. "person"). */
  classLabel: string;
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

export interface BuildPerInstanceTracksInput {
  engine: FrameLabelReader;
  /** Sample whose frame labels back the timeline. */
  sample: string;
  /** Frame-agnostic detection field path (e.g. `frames.detections`). */
  path: string;
  /** Total frames in the clip — the walk range `[1, totalFrames]`. */
  totalFrames: number;
  /** Frame rate, for the frame↔seconds mapping. */
  fps: number;
  resolveColor: (label: PerInstanceLabel) => string;
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
  label: LabelData
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
  path,
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
    path,
    totalFrames,
    fps,
    dynamicAttributes
  );
  assignDisplayOrdinals(states);

  const parents: Track[] = [];
  const childrenByParent = new Map<string, Track[]>();
  for (const [id, state] of states) {
    if (state.intervals.length === 0) {
      continue;
    }

    const parent = toTrack(id, state, resolveColor);
    parents.push(parent);

    const children = buildSubTracks(parent, state, dynamicAttributes, fps);
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

/** Close a state's currently-open presence interval at `endSec`. */
function closeInterval(state: InstanceState, endSec: number): void {
  if (state.currentStart === null) {
    return;
  }

  state.intervals.push({ start: state.currentStart, end: endSec });
  state.currentStart = null;
  state.inFrame = false;
}

function newInstanceState(label: LabelData): InstanceState {
  return {
    classLabel: labelOf(label),
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
  };
}

/**
 * Walk every frame and group the engine's labels into per-instance presence
 * intervals + keyframe times. Intervals still open at clip end are closed.
 */
function accumulatePresence(
  engine: FrameLabelReader,
  sample: string,
  path: string,
  totalFrames: number,
  fps: number,
  dynamicAttributes: readonly string[]
): Map<string, InstanceState> {
  const states = new Map<string, InstanceState>();

  for (let frame = 1; frame <= totalFrames; frame++) {
    const frameStartSec = (frame - 1) / fps;
    const present = new Set<string>();

    for (const label of engine.listLabels({ sample, path, frame })) {
      const id = addressIdOf(label);
      present.add(id);

      let state = states.get(id);
      if (!state) {
        state = newInstanceState(label);
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
  resolveColor: (label: PerInstanceLabel) => string
): Track {
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
      })
    ),
    // Point events render as diamond markers on top of the presence bar
    // via `TimelineTrack`'s no-`endSec` branch.
    ...state.keyframeTimes.map((startSec) => ({
      startSec,
      label: "Keyframe",
    })),
  ];

  return {
    id,
    label: `${state.classLabel} ${state.displayIndex}`,
    description: `Tracked "${state.classLabel}" (track ${state.displayIndex})`,
    color: resolveColor({
      label: state.classLabel,
      index: state.persistedIndex,
      instance: state.instance,
    }),
    events,
  };
}

/**
 * Order tracks by class then display ordinal — keeps instances of the same
 * class adjacent and the row order reproducible across runs.
 */
function sortByClassThenOrdinal(
  tracks: Track[],
  states: Map<string, InstanceState>
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
  id: string
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
  dynamicAttributes: readonly string[]
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
 * Coalesce a dynamic attribute's per-frame values into value segments. A new
 * segment opens whenever the value changes OR the frame isn't contiguous with
 * the previous one (a presence gap), so segments never bridge frames where the
 * instance was absent. Frames span `[(frame - 1) / fps, frame / fps]`, matching
 * the parent's presence-interval mapping. Records must be in frame order.
 */
export function segmentAttribute(
  records: ReadonlyArray<{ frame: number; value: unknown }>,
  fps: number
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
  fps: number
): Track[] {
  const tracks: Track[] = [];

  for (const attr of dynamicAttributes) {
    const records = state.attributeFrames.get(attr);
    if (!records || records.length === 0) {
      continue;
    }

    const segments = segmentAttribute(records, fps);
    if (segments.length === 0) {
      continue;
    }

    tracks.push(toSubTrack(parent, attr, segments));
  }

  return tracks;
}

/** Build the sub-track {@link Track} for one dynamic attribute's segments. */
function toSubTrack(
  parent: Track,
  attr: string,
  segments: AttributeSegment[]
): Track {
  const events: TrackEvent[] = segments.map(({ startSec, endSec, value }) => ({
    startSec,
    endSec,
    label: renderAttributeValue(value),
    color: hashColor(value),
    data: { value },
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
