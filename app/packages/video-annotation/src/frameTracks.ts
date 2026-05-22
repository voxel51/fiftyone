import type {
  Track,
  TrackEvent,
} from "../../playback/src/lib/tracks/TrackProvider";
import type { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

/**
 * Prefix the stream uses for label ids when a FiftyOne track `index`
 * is present.
 */
const TRACK_ID_PREFIX = "track-";

interface InstanceState {
  /** Class label observed for this instance (e.g. "person"). */
  classLabel: string;
  /** Numeric track index, used for sorting and as the instance-hash key. */
  trackIndex: number;
  /** Whether the instance was present in the most recent frame. */
  inFrame: boolean;
  /** Start time (sec) of the currently-open interval, if any. */
  currentStart: number | null;
  /** Closed presence intervals. */
  intervals: Array<{ start: number; end: number }>;
}

/**
 * Minimal label-shape passed to {@link BuildPerInstanceTracksInput.resolveColor}.
 * Mirrors the fields `getLabelColorFromContext` reads, so the color resolves
 * the same way it would for the matching label.
 */
export interface PerInstanceLabel {
  label: string;
  index: number;
}

export interface BuildPerInstanceTracksInput {
  stream: VideoFrameLabelsStream;
  resolveColor: (label: PerInstanceLabel) => string;
}

/**
 * Walk every frame in `[1, stream.totalFrames]`, group labels by
 * track id, and emit one {@link Track} per tracked instance whose events are
 * the contiguous presence intervals.
 *
 * Row labels combine the class with the track index (e.g. "person 5");
 * row color is resolved from the class so each row matches the colour
 * of its bbox overlay in the media tile.
 *
 * Labels without a track index (untracked) are ignored here — they
 * still render as overlays during playback but don't contribute rows.
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

  const states = new Map<string, InstanceState>();
  const closeInterval = (state: InstanceState, endSec: number) => {
    if (state.currentStart === null) {
      return;
    }

    state.intervals.push({ start: state.currentStart, end: endSec });
    state.currentStart = null;
    state.inFrame = false;
  };

  for (let frame = 1; frame <= totalFrames; frame++) {
    const frameStartSec = (frame - 1) / fps;
    const snapshot = stream.getValue(frameStartSec);
    const present = new Set<string>();
    if (snapshot) {
      // todo - adapter pattern to handle other label types
      for (const det of snapshot.detections) {
        if (!det.id.startsWith(TRACK_ID_PREFIX)) {
          continue;
        }

        present.add(det.id);

        let state = states.get(det.id);
        if (!state) {
          // Prefer the parsed-back-from-id index, but fall back to the
          // structured `index` field on the box so we still get a usable
          // sort key / instance hash if the id format ever drifts.
          const suffix = det.id.slice(TRACK_ID_PREFIX.length);
          const fromSuffix = Number(suffix);
          const idx = Number.isFinite(fromSuffix) ? fromSuffix : det.index ?? 0;

          state = {
            classLabel: det.label || "unknown",
            trackIndex: idx,
            inFrame: false,
            currentStart: null,
            intervals: [],
          };

          states.set(det.id, state);
        }
        if (!state.inFrame) {
          state.currentStart = frameStartSec;
          state.inFrame = true;
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

  // Close any intervals still open at clip end.
  const clipEndSec = totalFrames / fps;
  for (const state of states.values()) {
    closeInterval(state, clipEndSec);
  }

  const tracks: Track[] = [];
  for (const [id, state] of states) {
    if (state.intervals.length === 0) {
      continue;
    }

    const events: TrackEvent[] = state.intervals.map(({ start, end }) => ({
      startSec: start,
      endSec: end,
      label: "in frame",
    }));

    const suffix = id.slice(TRACK_ID_PREFIX.length);
    tracks.push({
      id,
      label: `${state.classLabel} ${suffix}`,
      description: `Tracked "${state.classLabel}" (track ${suffix})`,
      color: resolveColor({
        label: state.classLabel,
        index: state.trackIndex,
      }),
      events,
    });
  }

  // Sort by class then by numeric track index — keeps instances of the
  // same class adjacent and the row order reproducible across runs.
  tracks.sort((a, b) => {
    const sa = states.get(a.id)!;
    const sb = states.get(b.id)!;

    if (sa.classLabel !== sb.classLabel) {
      return sa.classLabel.localeCompare(sb.classLabel);
    }

    return sa.trackIndex - sb.trackIndex;
  });

  return tracks;
}
