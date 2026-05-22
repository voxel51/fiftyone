import type {
  Track,
  TrackEvent,
} from "../../playback/src/lib/tracks/TrackProvider";
import {
  getPresenceIntervals,
  type PresenceInterval,
  type SyntheticActor,
} from "./SyntheticLabelStream";

/**
 * Minimal label-shape passed to {@link buildSyntheticTracks}' resolver.
 * Mirrors the fields the overlay's color resolution reads, so a row's
 * color matches its bboxes — including under `COLOR_BY.INSTANCE`, which
 * hashes on `${label}-${instance._id}` when no numeric index is present
 * (the case for synthetic actors).
 */
export interface SyntheticActorLabel {
  label: string;
  instance: { _cls: "Instance"; _id: string };
}

const MAX_HIGHLIGHTS = 3;

function isInsideAny(t: number, intervals: PresenceInterval[]): boolean {
  for (const { startSec, endSec } of intervals) {
    if (t >= startSec && t <= endSec) return true;
  }
  return false;
}

/**
 * Times in [0, duration] at which the oscillator
 *   f(t) = 0.5 + 0.5 * sin(2π * (t / periodSec + phase))
 * hits its maximum (= 1). Each maximum corresponds to the actor being at
 * the rightmost (or topmost) edge of its trajectory.
 */
function maximaTimes(
  periodSec: number,
  phase: number,
  duration: number,
  limit: number
): number[] {
  // sin is maximal when its argument is π/2 + 2πn → t/period + phase = 0.25 + n
  const out: number[] = [];
  // Start n at the first integer for which t >= 0.
  const firstN = Math.ceil(phase - 0.25);
  for (let n = firstN; out.length < limit; n++) {
    const t = periodSec * (0.25 - phase + n);
    if (t < 0) continue;
    if (t > duration) break;
    out.push(t);
  }
  return out;
}

/**
 * Build per-actor timeline tracks from the synthetic stream's actor model.
 *
 * Each actor becomes one row: a full-duration interval (the actor is
 * "in frame" the whole clip) plus a handful of point events marking
 * deterministic moments along its trajectory (when the actor reaches
 * the right edge of the frame).
 *
 * Colors are resolved through the caller-supplied function so the rows
 * match whatever scheme the overlays use.
 */
export function buildSyntheticTracks(
  actors: SyntheticActor[],
  duration: number,
  resolveColor: (label: SyntheticActorLabel) => string
): Track[] {
  if (!(duration > 0)) return [];

  return actors.map((actor) => {
    const intervals = getPresenceIntervals(actor, duration);

    const presenceEvents: TrackEvent[] = intervals.map(
      ({ startSec, endSec }) => ({
        startSec,
        endSec,
        label: "in frame",
      })
    );

    // Only highlight x-maxima that fall inside a presence interval — a
    // "right edge" marker during a gap would be misleading.
    const highlights: TrackEvent[] = maximaTimes(
      actor.xPeriodSec,
      actor.xPhase,
      duration,
      MAX_HIGHLIGHTS * 2
    )
      .filter((t) => isInsideAny(t, intervals))
      .slice(0, MAX_HIGHLIGHTS)
      .map((t) => ({
        startSec: t,
        label: `${actor.label} → right edge`,
      }));

    return {
      id: actor.id,
      label: actor.label,
      description: `Synthetic actor "${actor.label}"`,
      color: resolveColor({
        label: actor.label,
        instance: { _cls: "Instance", _id: actor.id },
      }),
      events: [...presenceEvents, ...highlights],
    };
  });
}
