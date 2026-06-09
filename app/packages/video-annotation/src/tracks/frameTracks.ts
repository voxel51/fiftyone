import type {
  Track,
  TrackEvent,
} from "../../../playback/src/lib/tracks/TrackProvider";
import type { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";

/**
 * Synthetic-id prefixes emitted by {@link VideoFrameLabelsStream.extractDetections}.
 * `instance-` is preferred when the detection carries an `Instance._id`;
 * `track-` is the legacy fallback for data that only has the numeric
 * `index`. Both qualify the box for a timeline track row.
 */
const INSTANCE_ID_PREFIX = "instance-";
const TRACK_ID_PREFIX = "track-";

interface InstanceState {
  /** Class label observed for this instance (e.g. "person"). */
  classLabel: string;
  /**
   * Persisted track index carried on the underlying detection, when
   * present. Set for `track-`-prefixed boxes and for `instance-`-prefixed
   * boxes that the upstream pipeline already assigned a number to.
   * Undefined for freshly-drawn instances that haven't been numbered.
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

export interface BuildPerInstanceTracksInput {
  stream: VideoFrameLabelsStream;
  resolveColor: (label: PerInstanceLabel) => string;
}

/**
 * Walk every frame in `[1, stream.totalFrames]`, group labels by
 * synthetic overlay id, and emit one {@link Track} per tracked instance
 * whose events are the contiguous presence intervals.
 *
 * Includes both `instance-`-prefixed (Instance._id-based identity) and
 * `track-`-prefixed (legacy numeric-index identity) detections. Boxes
 * with no cross-frame identity (raw `_id` only) are skipped — they
 * still render as overlays during playback but don't contribute rows.
 *
 * Row labels combine the class with a per-class display ordinal (e.g.
 * "person 5"). For boxes that already carry a persisted `index`, that
 * number is used; for `Instance._id`-only boxes the ordinal is the
 * next free integer above the per-class max. Row color is resolved
 * from the class so each row matches the colour of its bbox overlay.
 *
 * Requires the stream's cache to cover the full range; call
 * {@link VideoFrameLabelsStream#warmupAll} and `await` it first.
 */
export function buildPerInstanceTracks({
  stream,
  resolveColor,
}: BuildPerInstanceTracksInput): Track[] {
  const { totalFrames, fps } = stream;
  if (totalFrames < 1 || !Number.isFinite(fps) || fps <= 0) {
    return [];
  }

  const states = accumulatePresence(stream);
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

/** A synthetic id qualifies for a track row only if it's instance/track-keyed. */
function isTrackedId(id: string): boolean {
  return id.startsWith(TRACK_ID_PREFIX) || id.startsWith(INSTANCE_ID_PREFIX);
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

function newInstanceState(det: {
  label?: string;
  index?: number;
  instance?: { _cls: "Instance"; _id?: string } | null;
}): InstanceState {
  return {
    classLabel: det.label || "unknown",
    persistedIndex: det.index,
    instance: det.instance,
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
 * Walk every frame and group tracked detections into per-instance presence
 * intervals + keyframe times. Intervals still open at clip end are closed.
 */
function accumulatePresence(
  stream: VideoFrameLabelsStream
): Map<string, InstanceState> {
  const { totalFrames, fps } = stream;
  const states = new Map<string, InstanceState>();

  for (let frame = 1; frame <= totalFrames; frame++) {
    const frameStartSec = (frame - 1) / fps;
    const snapshot = stream.getValue(frameStartSec);
    const present = new Set<string>();

    // todo - adapter pattern to handle other label types
    for (const det of snapshot?.detections ?? []) {
      if (!isTrackedId(det.id)) {
        continue;
      }

      present.add(det.id);

      let state = states.get(det.id);
      if (!state) {
        state = newInstanceState(det);
        states.set(det.id, state);
      }

      if (!state.inFrame) {
        state.currentStart = frameStartSec;
        state.inFrame = true;
      }

      if (det.keyframe) {
        state.keyframeTimes.push(frameStartSec);
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
