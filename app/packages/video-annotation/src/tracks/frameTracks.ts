import type { AnnotationEngine } from "@fiftyone/annotation";
import type { Track, TrackEvent } from "@fiftyone/playback";
import type { LabelData } from "@fiftyone/utilities";

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
  path: string
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
  paths,
  totalFrames,
  fps,
  resolveColor,
}: BuildPerInstanceTracksInput): Track[] {
  if (totalFrames < 1 || !Number.isFinite(fps) || fps <= 0) {
    return [];
  }

  const states = accumulatePresence(engine, sample, paths, totalFrames, fps);
  assignDisplayOrdinals(states);

  const tracks: Track[] = [];
  for (const [id, state] of states) {
    if (state.intervals.length === 0) {
      continue;
    }

    tracks.push(toTrack(id, state, resolveColor));
  }

  return sortByClassThenOrdinal(tracks, states);
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
  fps: number
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
  resolveColor: PerInstanceColorResolver
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
      })
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
      state.path
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
