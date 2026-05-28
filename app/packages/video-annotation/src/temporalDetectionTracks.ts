import type {
  Track,
  TrackEvent,
} from "../../playback/src/lib/tracks/TrackProvider";

/**
 * Shape of a single `TemporalDetection` as it arrives on the modal sample
 * dict. We only model the fields the track build reads; everything else
 * (dynamic attrs, etc.) is preserved on `data` for downstream consumers.
 */
export interface RawTemporalDetection {
  _cls?: "TemporalDetection";
  _id?: string;
  id?: string;
  label?: string;
  /** 1-indexed inclusive frame range `[first, last]`. */
  support?: [number, number];
  confidence?: number;
  [key: string]: unknown;
}

/**
 * Shape of a `TemporalDetections` wrapper field on the modal sample dict.
 */
export interface RawTemporalDetectionsField {
  _cls: "TemporalDetections";
  detections?: RawTemporalDetection[];
}

/**
 * Minimal label shape passed to {@link BuildTemporalDetectionTracksInput.resolveColor}.
 * Mirrors the fields `getLabelColorFromContext` reads.
 */
export interface TemporalDetectionLabelLike {
  _cls: "TemporalDetection";
  label: string;
  /**
   * The TD `_id`, exposed as `id` because that's the key FiftyOne's
   * value-mode color resolution falls back to when there's no class label.
   */
  id?: string;
}

export interface BuildTemporalDetectionTracksInput {
  /**
   * Top-level sample dict from `ModalSample.sample`. The function walks
   * the dict's top-level keys looking for `TemporalDetections` fields —
   * nested locations (e.g. under `predictions.events`) are not searched.
   */
  sample: Record<string, unknown>;
  /** Frame rate in frames per second. Used to convert support → seconds. */
  fps: number;
  /**
   * Resolve the row color for a TD. Receives the field path (e.g.
   * `"events"`) and a label-like dict so the result matches whatever the
   * Lighter overlay would have produced for the same label.
   */
  resolveColor: (path: string, label: TemporalDetectionLabelLike) => string;
}

/**
 * Payload attached to each emitted {@link TrackEvent.data}.
 *
 * Carries enough information that a downstream consumer (e.g. a drag-
 * handle handler, a sidebar click router) can identify the TD without
 * re-walking the sample dict.
 */
export interface TemporalDetectionEventData {
  /** Field path on the sample (e.g. `"events"`). */
  fieldPath: string;
  /** The TD's `_id` (or `id` fallback). */
  detectionId: string;
  /** Index of this TD inside its parent `detections` array. */
  detectionIndex: number;
  /** 1-indexed inclusive frame support `[first, last]`. */
  support: [number, number];
  /** Snapshot of the raw TD for inspectors / drag-source readback. */
  raw: RawTemporalDetection;
}

/**
 * Walk the top-level sample dict, find every `TemporalDetections` field,
 * and emit one {@link Track} per `TemporalDetection` whose single event
 * is an interval spanning `support`.
 *
 * Rows are returned grouped by field path, then ordered within each
 * group by `support[0]` (earlier first), with `_id` as a stable
 * tie-breaker. This makes the timeline read top-to-bottom roughly in
 * the order events occur.
 *
 * TDs missing a valid `support` (not a 2-tuple, NaN, or `last < first`)
 * are skipped. TDs with no `_id`/`id` are also skipped — we'd have no
 * stable handle for selection, edits, or persistence.
 *
 * Returns `[]` when the sample is empty, fps is invalid, or no TD
 * fields are present.
 */
export function buildTemporalDetectionTracks({
  sample,
  fps,
  resolveColor,
}: BuildTemporalDetectionTracksInput): Track[] {
  if (!sample || !Number.isFinite(fps) || fps <= 0) {
    return [];
  }

  const tracks: Track[] = [];

  for (const [fieldPath, value] of Object.entries(sample)) {
    if (!isTemporalDetectionsField(value)) {
      continue;
    }

    const detections = value.detections ?? [];
    const groupTracks: Array<{ track: Track; firstFrame: number }> = [];

    for (let i = 0; i < detections.length; i++) {
      const td = detections[i];
      const support = td.support;

      if (
        !Array.isArray(support) ||
        support.length !== 2 ||
        !Number.isFinite(support[0]) ||
        !Number.isFinite(support[1]) ||
        support[1] < support[0]
      ) {
        continue;
      }

      const detectionId = td._id ?? td.id;
      if (!detectionId) {
        continue;
      }

      const label = td.label ?? "";
      const startSec = (support[0] - 1) / fps;
      const endSec = support[1] / fps;

      const eventData: TemporalDetectionEventData = {
        fieldPath,
        detectionId,
        detectionIndex: i,
        support: [support[0], support[1]],
        raw: td,
      };

      // `resizable: true` opts the interval into in-place edit via the
      // TimelineTrack's drag handles. The drag-end callback is wired up
      // in {@link FrameLabelsTracks}.
      const event: TrackEvent & { resizable: true } = {
        startSec,
        endSec,
        label: label || "temporal detection",
        data: eventData,
        resizable: true,
      };

      const color = resolveColor(fieldPath, {
        _cls: "TemporalDetection",
        label,
        id: detectionId,
      });

      const rowLabel = label
        ? `${label} (${fieldPath})`
        : `${fieldPath} ${truncateId(detectionId)}`;

      groupTracks.push({
        track: {
          id: `td-${fieldPath}-${detectionId}`,
          label: rowLabel,
          description: `Temporal detection "${
            label || "unnamed"
          }" on \`${fieldPath}\` (frames ${support[0]}–${support[1]})`,
          color,
          events: [event],
        },
        firstFrame: support[0],
      });
    }

    groupTracks.sort((a, b) => {
      if (a.firstFrame !== b.firstFrame) {
        return a.firstFrame - b.firstFrame;
      }
      return a.track.id.localeCompare(b.track.id);
    });

    for (const entry of groupTracks) {
      tracks.push(entry.track);
    }
  }

  return tracks;
}

function isTemporalDetectionsField(
  value: unknown
): value is RawTemporalDetectionsField {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    (value as { _cls?: unknown })._cls === "TemporalDetections" &&
    Array.isArray((value as { detections?: unknown }).detections)
  );
}

function truncateId(id: string): string {
  return id.length > 8 ? id.slice(-8) : id;
}
