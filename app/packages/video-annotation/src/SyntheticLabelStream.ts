import { PlaybackStreamBase } from "../../playback/src/lib/playback/stream-base";

/** ObjectId hex string. */
export type ObjectIdHex = string;

export type PropagationMethod = "linear";

/** Provenance written on labels created by a propagation run. */
export interface PropagationBlob {
  method: PropagationMethod;
  run_id: ObjectIdHex;
  parent_keyframes: [ObjectIdHex, ObjectIdHex];
}

export interface SyntheticBox {
  id: string;
  label: string;
  /** Normalized [x, y, w, h] in [0, 1]. */
  bounding_box: [number, number, number, number];
  /**
   * FiftyOne track index, when present. Carried so downstream color-
   * mapping can use `COLOR_BY.INSTANCE`'s `${label}-${index}-...` hash
   * (otherwise instance mode would collapse tracked detections of the
   * same class to one color).
   */
  index?: number;
  /**
   * Mirrors {@link BaseLabel.instance} from `@fiftyone/looker`. Used as
   * the fallback `COLOR_BY.INSTANCE` hash seed for untracked detections,
   * and as a stable instance id for the synthetic stream (which has no
   * numeric index).
   */
  instance?: { _cls: "Instance"; _id?: string };
  /** `true` for user-authored / propagation source; `false` for interpolated. */
  keyframe: boolean;
  /** Provenance for propagation-created labels; `null` for keyframes. */
  propagation: PropagationBlob | null;
}

export interface FrameLabelSnapshot {
  frameNumber: number;
  detections: SyntheticBox[];
}

export interface SyntheticActor {
  id: string;
  label: string;
  width: number;
  height: number;
  /** Cycle length in seconds for x and y trajectories. */
  xPeriodSec: number;
  yPeriodSec: number;
  xPhase: number;
  yPhase: number;
  /**
   * Presence schedule: the actor is in frame for `presenceDuty` fraction
   * of each `presenceCycleSec`-long cycle, starting at `presencePhase`
   * (0–1) of the way through that cycle at t=0. Same shape as the
   * trajectory oscillators so the math composes the same way.
   */
  presenceCycleSec: number;
  presenceDuty: number;
  presencePhase: number;
}

/**
 * Clip-relative actor spec — cycle counts are expressed per-clip so the
 * motion / presence rhythms scale to whatever video length is loaded.
 * Resolve to concrete time-domain {@link SyntheticActor}s via
 * {@link resolveActor} once the clip duration is known.
 */
export interface SyntheticActorSpec {
  id: string;
  label: string;
  width: number;
  height: number;
  /** Number of x/y trajectory oscillations across the full clip. */
  xCyclesPerClip: number;
  yCyclesPerClip: number;
  xPhase: number;
  yPhase: number;
  /** Number of presence (enter/exit) cycles across the full clip. */
  presenceCyclesPerClip: number;
  presenceDuty: number;
  presencePhase: number;
}

export interface PresenceInterval {
  startSec: number;
  endSec: number;
}

/**
 * Project a clip-relative {@link SyntheticActorSpec} onto an absolute-time
 * {@link SyntheticActor} for the given clip duration.
 */
export function resolveActor(
  spec: SyntheticActorSpec,
  duration: number
): SyntheticActor {
  const safeDuration = duration > 0 ? duration : 1;
  return {
    id: spec.id,
    label: spec.label,
    width: spec.width,
    height: spec.height,
    xPeriodSec: safeDuration / Math.max(spec.xCyclesPerClip, 1e-3),
    yPeriodSec: safeDuration / Math.max(spec.yCyclesPerClip, 1e-3),
    xPhase: spec.xPhase,
    yPhase: spec.yPhase,
    presenceCycleSec: safeDuration / Math.max(spec.presenceCyclesPerClip, 1e-3),
    presenceDuty: spec.presenceDuty,
    presencePhase: spec.presencePhase,
  };
}

export const DEFAULT_ACTOR_SPECS: SyntheticActorSpec[] = [
  {
    id: "actor-a",
    label: "person",
    width: 0.18,
    height: 0.32,
    // Two slow sweeps across the clip horizontally, ~1.3 vertically.
    xCyclesPerClip: 1,
    yCyclesPerClip: 0.5,
    xPhase: 0,
    yPhase: 0.25,
    // In ~60% of the time, two enter/exit cycles.
    presenceCyclesPerClip: 2,
    presenceDuty: 0.6,
    presencePhase: 0,
  },
  {
    id: "actor-b",
    label: "car",
    width: 0.22,
    height: 0.14,
    // Faster horizontal motion (cars move).
    xCyclesPerClip: 1.2,
    yCyclesPerClip: 1,
    xPhase: 0.5,
    yPhase: 0.6,
    // Starts in-frame briefly, then a longer middle appearance.
    presenceCyclesPerClip: 1.5,
    presenceDuty: 0.5,
    presencePhase: 0.4,
  },
  {
    id: "actor-c",
    label: "dog",
    width: 0.12,
    height: 0.12,
    xCyclesPerClip: 0.8,
    yCyclesPerClip: 1.3,
    xPhase: 0.8,
    yPhase: 0.1,
    // Starts out-of-frame, several short visits.
    presenceCyclesPerClip: 2.5,
    presenceDuty: 0.4,
    presencePhase: 0.6,
  },
];

const TWO_PI = Math.PI * 2;

function oscillate(t: number, periodSec: number, phase: number): number {
  // sine in [-1, 1] -> [0, 1]
  return 0.5 + 0.5 * Math.sin(TWO_PI * (t / periodSec + phase));
}

/** Position in the current presence cycle, normalized to [0, 1). */
function presenceOffset(time: number, actor: SyntheticActor): number {
  const raw = time / actor.presenceCycleSec + actor.presencePhase;
  return raw - Math.floor(raw);
}

/** True when the actor's presence cycle says it's in frame at `time`. */
export function isPresent(time: number, actor: SyntheticActor): boolean {
  return presenceOffset(time, actor) < actor.presenceDuty;
}

/**
 * Enumerate the presence intervals (start, end pairs) for an actor over
 * `[0, duration]`. Intervals are clipped to the duration; the actor may
 * be in mid-interval at t=0 or at t=duration.
 */
export function getPresenceIntervals(
  actor: SyntheticActor,
  duration: number
): PresenceInterval[] {
  if (!(duration > 0)) return [];

  const {
    presenceCycleSec: cycle,
    presenceDuty: duty,
    presencePhase: phase,
  } = actor;
  const intervalLen = cycle * duty;
  const out: PresenceInterval[] = [];

  // Cycle n starts at t = cycle * (n - phase). Walk forward until we pass
  // duration, including n=-1 so a cycle straddling t=0 is captured.
  for (let n = -1; ; n++) {
    const cycleStart = cycle * (n - phase);
    if (cycleStart >= duration) break;
    const intervalEnd = cycleStart + intervalLen;
    const start = Math.max(0, cycleStart);
    const end = Math.min(duration, intervalEnd);
    if (end > start) out.push({ startSec: start, endSec: end });
  }
  return out;
}

function snapshotAtTime(
  time: number,
  fps: number,
  actors: SyntheticActor[]
): FrameLabelSnapshot {
  const frameNumber = Math.max(0, Math.floor(time * fps));
  const detections: SyntheticBox[] = [];
  for (const actor of actors) {
    if (!isPresent(time, actor)) continue;
    // Position the bbox top-left so the whole box stays inside [0, 1].
    const maxX = 1 - actor.width;
    const maxY = 1 - actor.height;
    const x = oscillate(time, actor.xPeriodSec, actor.xPhase) * maxX;
    const y = oscillate(time, actor.yPeriodSec, actor.yPhase) * maxY;
    detections.push({
      id: actor.id,
      label: actor.label,
      bounding_box: [x, y, actor.width, actor.height],
      // Per-actor stable instance so COLOR_BY.INSTANCE produces distinct
      // colors per synthetic actor (the index path doesn't apply here
      // — synthetic actors have no numeric index by design).
      instance: { _cls: "Instance", _id: actor.id },
      keyframe: true,
      propagation: null,
    });
  }
  return { frameNumber, detections };
}

/**
 * Demo / test stream that emits a deterministic moving set of bboxes as a
 * function of time. Synchronous — no fetch, never stalls the clock. Useful
 * for exercising the playback → overlay diff path without real label data.
 */
export class SyntheticLabelStream extends PlaybackStreamBase<FrameLabelSnapshot> {
  private readonly fps: number;
  private actors: SyntheticActor[];

  constructor(
    id: string,
    opts: { fps: number; duration?: number; actors?: SyntheticActor[] }
  ) {
    super(id, {
      blocking: false,
      duration: opts.duration,
      nativeStepSeconds: 1 / opts.fps,
      lookupPolicy: {
        type: "nearestPrevious",
        thresholdSeconds: 1 / opts.fps,
      },
    });
    this.fps = opts.fps;
    this.actors = opts.actors ?? [];
  }

  /**
   * Replace the actor set. Callers typically resolve clip-relative specs
   * to absolute actors once the video duration is known and call this.
   * The next commit (seek or RAF tick) will reflect the new actors.
   */
  setActors(actors: SyntheticActor[]): void {
    this.actors = actors;
  }

  bufferState(): "ready" {
    return "ready";
  }

  prefetch(): void {
    // no-op — generation is synchronous
  }

  getValue(time: number): FrameLabelSnapshot {
    return snapshotAtTime(time, this.fps, this.actors);
  }
}
