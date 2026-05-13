import { streamValueAtom } from "./atoms";
import type {
  BufferReadiness,
  PlaybackStore,
  PlaybackStream,
  StreamLookupPolicy,
} from "./types";

export interface PlaybackStreamBaseOptions {
  /**
   * Whether this stream blocks the clock when its data isn't ready.
   * @default true
   */
  blocking?: boolean;
  /**
   * Total duration of this stream's data in seconds. The engine derives
   * the timeline's overall duration from the max of every registered
   * stream's value.
   */
  duration?: number;
  /**
   * Native sample period in seconds. The engine derives the global
   * `stepIntervalAtom` from the min across registered streams' values.
   */
  nativeStepSeconds?: number;
  /** @default 3 */
  lookaheadSeconds?: number;
  /** @default { type: "nearest", thresholdSeconds: 0.1 } */
  lookupPolicy?: StreamLookupPolicy;
}

/**
 * Abstract base class for `PlaybackStream` implementations. Provides:
 *
 * - Sensible defaults for `blocking`, `lookaheadSeconds`, and `lookupPolicy`
 * - Automatic wiring of `onCommit` into the `streamValueAtom(id)` family,
 *   so consumers can read the resolved value via `useStream(id)` without
 *   the subclass having to know about atoms.
 *
 * Subclasses implement three methods:
 *
 * - `bufferState(time)` — readiness at a given time
 * - `prefetch(range)`   — kick off a fetch when readiness is "missing"
 * - `getValue(time)`    — resolve the data to publish at this time
 *
 * @example
 * ```ts
 * class VideoStream extends PlaybackStreamBase<VideoFrame> {
 *   private cache = new Map<number, VideoFrame>();
 *
 *   bufferState(t: number) {
 *     return resolveAtTime(this.cache, t, this.lookupPolicy) ? "ready" : "missing";
 *   }
 *   prefetch([start, end]: [number, number]) { ... }
 *   getValue(t: number) { return resolveAtTime(this.cache, t, this.lookupPolicy); }
 * }
 * ```
 */
export abstract class PlaybackStreamBase<T> implements PlaybackStream {
  readonly blocking: boolean;
  readonly duration?: number;
  readonly nativeStepSeconds?: number;
  readonly lookaheadSeconds: number;
  readonly lookupPolicy: StreamLookupPolicy;

  constructor(
    public readonly id: string,
    options: PlaybackStreamBaseOptions = {}
  ) {
    this.blocking = options.blocking ?? true;
    this.duration = options.duration;
    this.nativeStepSeconds = options.nativeStepSeconds;
    this.lookaheadSeconds = options.lookaheadSeconds ?? 3;
    this.lookupPolicy = options.lookupPolicy ?? {
      type: "nearest",
      thresholdSeconds: 0.1,
    };
  }

  abstract bufferState(time: number): BufferReadiness;
  abstract prefetch(range: [number, number]): void;

  /**
   * Resolve the value to publish at the given committed time. Called from
   * `onCommit` and the result is written to `streamValueAtom(this.id)`.
   */
  abstract getValue(time: number): T | null;

  /**
   * Default `onCommit`: resolves the value via `getValue` and publishes it.
   * Override only if you need to write to multiple atoms or do extra work.
   */
  onCommit(time: number, store: PlaybackStore): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.set(streamValueAtom(this.id) as any, this.getValue(time));
  }

  /**
   * Optional — subclasses override to expose buffered ranges to the timeline
   * track UI. Default returns no ranges.
   */
  bufferedRanges(): Array<[number, number]> {
    return [];
  }
}
