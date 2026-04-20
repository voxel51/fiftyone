import type { Buffers } from "@fiftyone/utilities";

// --- Time primitives ---

/** The kind of timeline. "timestamp" is stubbed for future use. */
export type TimelineType = "sequence" | "duration" | "timestamp";

/** Unique name identifying a timeline instance. */
export type TimelineName = string;

/** Quantized time value: frame number (1-indexed) or nanoseconds. */
export type TimeInt = number;

/** Smooth float for scrubbing / interpolation. */
export type TimeReal = number;

/** Inclusive range of quantized time values. */
export type TimeRange = Readonly<[TimeInt, TimeInt]>;

// --- Snapshot (single source of truth per tick) ---

export interface TimeSnapshot {
  readonly timeline: TimelineName;
  readonly timeInt: TimeInt;
  readonly timeReal: TimeReal;
  /** Monotonic counter — discard stale async work when frameId is outdated. */
  readonly frameId: number;
}

// --- Play state ---

export type PlayState = "playing" | "paused" | "buffering" | "following";

// --- Loop mode ---

export type LoopMode = "none" | "loop" | "ping-pong";

// --- Selection policy ---

export type SelectionPolicy = "latestAt" | "nearest" | "exact" | "interpolate";

// --- Buffer readiness ---

export type BufferReadiness = "ready" | "loading" | "missing";

/** Proactive buffer headroom targets for a subscriber at the current time. */
export interface BufferGoal {
  /** The minimum playable range the subscriber wants to keep covered. */
  maintain: TimeRange;
  /** The farther range the subscriber wants background top-up to refill to. */
  refillTo: TimeRange;
}

/** Context provided when a subscriber computes a proactive buffer goal. */
export interface BufferGoalInfo {
  /** Current immutable timeline config. */
  config: Readonly<TimelineConfig>;
  /** Full clamped playback range for the active timeline. */
  range: TimeRange;
}

// --- Subscriber ---

export interface SubscriberCapabilities {
  /** Timelines this subscriber is interested in. Default: [active timeline]. */
  timelines?: TimelineName[];
  /** If true, playback waits for this subscriber's bufferState to report "ready". */
  critical?: boolean;
  /** Selection policy hint. Default: undefined (subscriber-managed). */
  policy?: SelectionPolicy;
}

export interface Subscriber {
  /** Unique identifier for this subscriber. */
  id: string;

  /**
   * Called on every committed tick. The subscriber should render at the
   * given snapshot's timeInt. This is the only required callback.
   */
  renderAt(snapshot: TimeSnapshot): void;

  /** Optional capabilities declaration. */
  capabilities?: SubscriberCapabilities;

  /** Pre-fetch data for a range of frames. Default: async no-op. */
  prefetch?(range: TimeRange): Promise<void>;

  /** Report buffer readiness for a given time. Default: "ready". */
  bufferState?(time: TimeInt): BufferReadiness;

  /** Report all event times this subscriber covers. Default: []. */
  reportCoverage?(): TimeInt[];

  /** Report loaded/play-ready coverage ranges. Default: []. */
  reportBufferedRanges?(): Buffers;

  /** Report proactive keep-ahead targets for the current playback time. */
  getBufferGoal?(time: TimeInt, info: BufferGoalInfo): BufferGoal | null;

  /** Called when the timeline config or identity changes. Default: no-op. */
  onTimelineChanged?(info: TimelineInfo): void;
}

// --- Timeline info ---

export interface TimelineInfo {
  name: TimelineName;
  type: TimelineType;
  range: TimeRange;
  config: Readonly<TimelineConfig>;
}

// --- Config (discriminated union by timeline type) ---

/** Shared fields across all timeline types. */
export interface BaseTimelineConfig {
  /** Default: "none". Accepts boolean for convenience (true → "loop"). */
  loop?: boolean | LoopMode;
  /** Default: 1 */
  speed?: number;
  /** rAF throttle frequency in Hz. Default: 30 (sequence), 60 (duration). */
  tickRate?: number;
  /** Default: false */
  useTimeIndicator?: boolean;
}

/** Sequence: frame-based, 1-indexed. */
export interface SequenceTimelineConfig extends BaseTimelineConfig {
  /** Optional — defaults to "sequence" when omitted. */
  type?: "sequence";
  totalFrames: number;
  /** Default: 1 (1-indexed) */
  defaultFrameNumber?: TimeInt;
}

/** Duration: nanosecond-based, 0-indexed. */
export interface DurationTimelineConfig extends BaseTimelineConfig {
  type: "duration";
  /** Total duration in nanoseconds. */
  duration: number;
  /** Default: 0 */
  defaultTime?: TimeInt;
}

/** Timestamp: stubbed for future use. */
export interface TimestampTimelineConfig extends BaseTimelineConfig {
  type: "timestamp";
}

export type TimelineConfig =
  | SequenceTimelineConfig
  | DurationTimelineConfig
  | TimestampTimelineConfig;

// --- Type guards ---

export function isSequenceConfig(
  c: TimelineConfig
): c is SequenceTimelineConfig {
  return !c.type || c.type === "sequence";
}

export function isDurationConfig(
  c: TimelineConfig
): c is DurationTimelineConfig {
  return c.type === "duration";
}

// --- Creation params ---

export interface CreateTimelineParams {
  name: TimelineName;
  config?: TimelineConfig;
  useExternalClock?: boolean;
}

// --- Utility ---

/**
 * Makes selected keys of T optional.
 * `Optional<CreateTimelineParams, "name">` → name becomes optional.
 */
export type Optional<T extends object, K extends keyof T = keyof T> = Omit<
  T,
  K
> &
  Partial<Pick<T, K>>;
