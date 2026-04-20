import { clearChannel, getEventBus, type EventHandler } from "@fiftyone/events";
import type { BufferRange, Buffers } from "@fiftyone/utilities";
import { BufferManager } from "@fiftyone/utilities";
import {
  DEFAULT_FRAME_NUMBER,
  DEFAULT_LOOP,
  DEFAULT_SPEED,
  DEFAULT_TICK_RATE,
  DEFAULT_TICK_RATE_DURATION,
  DEFAULT_USE_TIME_INDICATOR,
  PLAY_STATE_PAUSED,
  PLAY_STATE_PLAYING,
  type PlayState,
} from "../constants";
import { getLoadRangeForFrameNumber } from "../utils";
import { PlaybackEngine } from "./PlaybackEngine";
import { TimeIndex } from "./TimeIndex";
import { createInitialSnapshot, createSnapshot } from "./TimeSnapshot";
import { clampTime, sequenceRange } from "./TimeValue";
import type { TimelineEventGroup, TimelineEventMeta } from "../events";
import type {
  BaseTimelineConfig,
  CreateTimelineParams,
  LoopMode,
  SequenceTimelineConfig,
  Subscriber,
  TimeInt,
  TimelineConfig,
  TimelineName,
  TimeRange,
  TimeSnapshot,
} from "../types";
import { isDurationConfig, isSequenceConfig } from "../types";

function buffersEqual(left: Buffers, right: Buffers) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index][0] !== right[index][0] ||
      left[index][1] !== right[index][1]
    ) {
      return false;
    }
  }

  return true;
}

function mergeBuffers(buffers: Buffers): Buffers {
  if (!buffers.length) {
    return [];
  }

  const manager = new BufferManager();
  buffers.forEach((range) => manager.addNewRange(range));
  return manager.buffers.map((range) => [range[0], range[1]] as const);
}

function intersectBuffers(left: Buffers, right: Buffers): Buffers {
  if (!left.length || !right.length) {
    return [];
  }

  const intersections: BufferRange[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    const leftRange = left[leftIndex];
    const rightRange = right[rightIndex];
    const start = Math.max(leftRange[0], rightRange[0]);
    const end = Math.min(leftRange[1], rightRange[1]);

    if (start <= end) {
      intersections.push([start, end]);
    }

    if (leftRange[1] < rightRange[1]) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }

  return intersections;
}

function getContainingBufferRange(
  buffers: Buffers,
  value: number
): BufferRange | null {
  return (
    buffers.find((range) => range[0] <= value && range[1] >= value) ?? null
  );
}

function rangesTouchOrOverlap(
  left: Readonly<BufferRange>,
  right: Readonly<BufferRange>
) {
  return left[0] <= right[1] + 1 && right[0] <= left[1] + 1;
}

function getLoadedBuffers(subscribers: Iterable<Subscriber>): Buffers {
  const criticalBuffers: Buffers[] = [];
  const allBuffers = new BufferManager();

  for (const subscriber of subscribers) {
    const mergedBuffers = mergeBuffers(
      subscriber.reportBufferedRanges?.() ?? []
    );

    mergedBuffers.forEach((range) => {
      allBuffers.addNewRange([range[0], range[1]]);
    });

    if (subscriber.capabilities?.critical) {
      criticalBuffers.push(mergedBuffers);
    }
  }

  if (!criticalBuffers.length) {
    return allBuffers.buffers;
  }

  return criticalBuffers.reduce<Buffers>((accumulator, nextBuffers) => {
    return intersectBuffers(accumulator, nextBuffers);
  });
}

/**
 * Single source of truth for a timeline.
 */
export class TimelineManager {
  readonly name: TimelineName;
  #events = getEventBus<TimelineEventGroup>();

  #timeIndex = new TimeIndex();
  #engine: PlaybackEngine;

  #snapshot: TimeSnapshot;
  #playState: PlayState = PLAY_STATE_PAUSED;
  #config: Readonly<TimelineConfig> = Object.freeze({
    totalFrames: 0,
  } as SequenceTimelineConfig);
  #isInitialized = false;
  #subscribers = new Map<string, Subscriber>();
  #bufferManager = new BufferManager();
  #currentBufferingRange: BufferRange = [0, 0];
  #inFlightProactivePrefetches = new Map<string, BufferRange>();
  #useExternalClock = false;

  constructor(params: CreateTimelineParams) {
    this.name = params.name;
    this.#useExternalClock = params.useExternalClock ?? false;
    this.#snapshot = createInitialSnapshot(this.name, DEFAULT_FRAME_NUMBER);

    this.#engine = new PlaybackEngine({
      getConfig: () => this.#config,
      getRange: () => this.getRange(),
      getSnapshot: () => this.#snapshot,
      getPlayState: () => this.#playState,
      getSubscribers: () => this.#subscribers,
      getTimeIndex: () => this.#timeIndex,
      commitSnapshot: (snap) => this.commitSnapshot(snap),
      onPlayStateChange: (state) => this.setPlayState(state),
      onBufferRequest: (range) => this.setCurrentBufferingRange(range),
      timelineName: this.name,
      timelineType: this.#config.type ?? "sequence",
    });
  }

  // --- Readonly accessors ---

  get snapshot(): TimeSnapshot {
    return this.#snapshot;
  }

  get config(): Readonly<TimelineConfig> {
    return this.#config;
  }

  get playState(): PlayState {
    return this.#playState;
  }

  get isInitialized(): boolean {
    return this.#isInitialized;
  }

  get range(): TimeRange {
    return this.getRange();
  }

  get speed(): number {
    return this.#config.speed ?? DEFAULT_SPEED;
  }

  get updateFrequency(): number {
    const tickRate = this.#config.tickRate ?? DEFAULT_TICK_RATE;
    if (isDurationConfig(this.#config)) {
      return 1000 / tickRate;
    }

    const speed = this.#config.speed ?? DEFAULT_SPEED;
    return 1000 / (tickRate * speed);
  }

  get loadedBuffers(): Buffers {
    return this.#bufferManager.buffers;
  }

  get currentBufferingRange(): BufferRange {
    return this.#currentBufferingRange;
  }

  get timeIndex(): Readonly<TimeIndex> {
    return this.#timeIndex;
  }

  // --- Lifecycle ---

  initialize(params: CreateTimelineParams): void {
    if (!params.config) {
      return;
    }

    const config = params.config;
    const type = config.type ?? "sequence";

    let configWithDefaults: TimelineConfig;

    if (isDurationConfig(config)) {
      configWithDefaults = {
        type: "duration",
        duration: config.duration,
        defaultTime: config.defaultTime ?? 0,
        loop: config.loop ?? DEFAULT_LOOP,
        speed: config.speed ?? DEFAULT_SPEED,
        tickRate: config.tickRate ?? DEFAULT_TICK_RATE_DURATION,
        useTimeIndicator: config.useTimeIndicator ?? DEFAULT_USE_TIME_INDICATOR,
      };
    } else {
      // sequence (default) or fallback
      const seqConfig = config as SequenceTimelineConfig;
      configWithDefaults = {
        type: "sequence",
        totalFrames: seqConfig.totalFrames,
        defaultFrameNumber: Math.max(
          seqConfig.defaultFrameNumber ?? DEFAULT_FRAME_NUMBER,
          DEFAULT_FRAME_NUMBER
        ),
        loop: seqConfig.loop ?? DEFAULT_LOOP,
        speed: seqConfig.speed ?? DEFAULT_SPEED,
        tickRate: seqConfig.tickRate ?? DEFAULT_TICK_RATE,
        useTimeIndicator:
          seqConfig.useTimeIndicator ?? DEFAULT_USE_TIME_INDICATOR,
      };
    }

    if (this.#isInitialized) {
      this.setConfig(configWithDefaults);
      return;
    }

    // Validate per type
    if (isSequenceConfig(configWithDefaults)) {
      const defaultFrame =
        configWithDefaults.defaultFrameNumber ?? DEFAULT_FRAME_NUMBER;
      if (defaultFrame > configWithDefaults.totalFrames) {
        throw new Error(
          `Default frame number ${defaultFrame} is greater than total frames ${configWithDefaults.totalFrames}`
        );
      }
      this.#snapshot = createInitialSnapshot(this.name, defaultFrame);
    } else if (isDurationConfig(configWithDefaults)) {
      const defaultTime = configWithDefaults.defaultTime ?? 0;
      if (defaultTime > configWithDefaults.duration) {
        throw new Error(
          `Default time ${defaultTime} is greater than duration ${configWithDefaults.duration}`
        );
      }
      this.#snapshot = createInitialSnapshot(this.name, defaultTime);
    }

    this.#subscribers = new Map();
    this.#bufferManager = new BufferManager();
    this.#playState = PLAY_STATE_PAUSED;
    this.#inFlightProactivePrefetches.clear();
    this.#useExternalClock = params.useExternalClock ?? false;

    // Rebuild engine with correct timeline type
    this.#engine = new PlaybackEngine({
      getConfig: () => this.#config,
      getRange: () => this.getRange(),
      getSnapshot: () => this.#snapshot,
      getPlayState: () => this.#playState,
      getSubscribers: () => this.#subscribers,
      getTimeIndex: () => this.#timeIndex,
      commitSnapshot: (snap) => this.commitSnapshot(snap),
      onPlayStateChange: (state) => this.setPlayState(state),
      onBufferRequest: (range) => this.setCurrentBufferingRange(range),
      timelineName: this.name,
      timelineType: type,
    });

    this.setConfig(configWithDefaults);

    this.#isInitialized = true;
    this.#events.dispatch("timeline:initialized", this.meta);
  }

  destroy(): void {
    this.#engine.destroy();
    this.#subscribers.clear();
    this.#inFlightProactivePrefetches.clear();
    this.#timeIndex.clear();
    this.#events.dispatch("timeline:destroyed", this.meta);
    clearChannel(this.name);
  }

  // --- Playback ---

  play(): void {
    if (!this.#isInitialized) return;
    if (this.#playState === "buffering") return;

    this.setPlayState(PLAY_STATE_PLAYING);
  }

  pause(): void {
    this.setPlayState(PLAY_STATE_PAUSED);
    this.#engine.stop();
  }

  togglePlay(): void {
    if (this.#playState === PLAY_STATE_PLAYING) {
      this.pause();
    } else {
      this.play();
    }
  }

  // --- Time control ---

  async setTime(time: TimeInt): Promise<void> {
    const range = this.getRange();
    const clamped = clampTime(time, range);

    if (!this.#subscribers || this.#subscribers.size === 0) {
      this.#snapshot = createSnapshot(this.name, clamped, clamped);
      this.#events.dispatch("timeline:timeChange", {
        ...this.meta,
        snapshot: this.#snapshot,
      });
      return;
    }

    const newLoadRange = getLoadRangeForFrameNumber(clamped, this.#config);
    const isCurrentValueNotInBuffer =
      !this.#bufferManager.isValueInBuffer(clamped);

    if (!this.#bufferManager.containsRange(newLoadRange)) {
      const prefetchPromises: Promise<void>[] = [];
      this.#subscribers.forEach((subscriber) => {
        if (subscriber.prefetch) {
          prefetchPromises.push(subscriber.prefetch(newLoadRange));
        }
      });

      this.setCurrentBufferingRange(newLoadRange);

      const allSettled = Promise.allSettled(prefetchPromises);

      if (isCurrentValueNotInBuffer) {
        try {
          await allSettled;
          this.refreshBufferedRanges();
        } catch (e) {
          console.error(e);
        } finally {
          this.setCurrentBufferingRange([0, 0]);
        }
      } else {
        allSettled.then(() => {
          this.refreshBufferedRanges();
          this.setCurrentBufferingRange([0, 0]);
        });
      }
    }

    // Commit the new snapshot
    this.#snapshot = createSnapshot(this.name, clamped, clamped);

    // Ask all subscribers to render
    this.#subscribers.forEach((subscriber) => {
      subscriber.renderAt(this.#snapshot);
    });

    this.#events.dispatch("timeline:timeChange", {
      ...this.meta,
      snapshot: this.#snapshot,
    });

    this.maybePrefetchAhead(this.#snapshot.timeInt);
  }

  /**
   * Step forward using TimeIndex if populated, otherwise +1.
   */
  async stepForward(): Promise<void> {
    const current = this.#snapshot.timeInt;
    const range = this.getRange();

    let next: TimeInt;
    if (!this.#timeIndex.isEmpty) {
      next = this.#timeIndex.getNextTime(current) ?? current;
    } else {
      next = Math.min(current + 1, range[1]);
    }

    if (next !== current) {
      await this.setTime(next);
    }
  }

  /**
   * Step backward using TimeIndex if populated, otherwise -1.
   */
  async stepBackward(): Promise<void> {
    const current = this.#snapshot.timeInt;
    const range = this.getRange();

    let prev: TimeInt;
    if (!this.#timeIndex.isEmpty) {
      prev = this.#timeIndex.getPrevTime(current) ?? current;
    } else {
      prev = Math.max(current - 1, range[0]);
    }

    if (prev !== current) {
      await this.setTime(prev);
    }
  }

  async refresh(): Promise<void> {
    await this.setTime(this.#snapshot.timeInt);
  }

  // --- Config ---

  setSpeed(speed: number): void {
    this.updateConfig({ speed });
  }

  setTickRate(rate: number): void {
    this.updateConfig({ tickRate: rate });
  }

  setLoopMode(mode: LoopMode | boolean): void {
    this.updateConfig({ loop: mode });
  }

  /**
   * Set totalFrames for sequence timelines.
   * Used by video.ts when the frame count becomes known after load.
   */
  setTotalFrames(n: number): void {
    const c = this.#config;
    if (!isSequenceConfig(c)) {
      console.warn("setTotalFrames called on non-sequence timeline");
      return;
    }
    this.setConfig({ ...c, totalFrames: n });
  }

  setTimeSelection(range: TimeRange | null): void {
    if (range) {
      this.#events.dispatch("timeline:rangeChange", { ...this.meta, range });
    }
  }

  updateConfig(delta: Partial<BaseTimelineConfig>): void {
    this.setConfig({ ...this.#config, ...delta });
  }

  // --- Subscribers ---

  subscribe(sub: Subscriber): () => void {
    if (this.#subscribers.has(sub.id)) {
      console.warn(
        `Subscription with ${sub.id} already exists for timeline ${this.name}. Replacing.`
      );
    }

    // Apply defaults for optional fields
    const enriched: Subscriber = {
      ...sub,
      prefetch: sub.prefetch ?? (async () => {}),
      bufferState: sub.bufferState ?? (() => "ready"),
      reportCoverage: sub.reportCoverage ?? (() => []),
      reportBufferedRanges: sub.reportBufferedRanges ?? (() => []),
      getBufferGoal: sub.getBufferGoal,
      capabilities: {
        critical: sub.capabilities?.critical ?? false,
        timelines: sub.capabilities?.timelines ?? [this.name],
        policy: sub.capabilities?.policy,
      },
    };

    this.#subscribers.set(sub.id, enriched);
    this.#bufferManager.reset();
    this.refreshCoverage();
    this.refreshBufferedRanges();

    return () => this.unsubscribe(sub.id);
  }

  unsubscribe(id: string): void {
    this.#subscribers.delete(id);
    this.#inFlightProactivePrefetches.delete(id);
    this.refreshCoverage();
    this.refreshBufferedRanges();
  }

  // --- Seek notifications ---

  notifySeekStart(): void {
    this.#events.dispatch("timeline:seekStart", this.meta);
  }

  notifySeekEnd(): void {
    this.#events.dispatch("timeline:seekEnd", this.meta);
  }

  // --- Event subscription ---

  on<E extends keyof TimelineEventGroup>(
    event: E,
    handler: EventHandler<TimelineEventGroup[E]>
  ): () => void {
    return this.#events.on(event, handler);
  }

  // --- Play state management ---

  setPlayState(state: PlayState): void {
    if (this.#playState === state) return;

    this.#playState = state;
    this.#events.dispatch("timeline:playStateChange", { ...this.meta, state });

    if (!this.#useExternalClock) {
      if (state === PLAY_STATE_PLAYING && this.#isInitialized) {
        this.startAnimation();
      }
      if (state === PLAY_STATE_PAUSED) {
        this.#engine.stop();
      }
    }
  }

  // --- Animation ---

  startAnimation(): void {
    if (this.#playState === PLAY_STATE_PAUSED) {
      this.#engine.stop();
      return;
    }
    this.#engine.start();
  }

  /**
   * Sets the timeInt without notifying subscribers or dispatching events.
   * Used to sync with externally-driven frame changes when animation is inactive.
   */
  syncFrameNumber(n: number): void {
    if (!this.#engine.isRunning) {
      this.#snapshot = createSnapshot(this.name, n, n);
    }
  }

  refreshBufferedRanges(): void {
    const nextBufferManager = new BufferManager(
      getLoadedBuffers(this.#subscribers.values())
    );

    const previousLoaded = this.#bufferManager.buffers;
    const previousLoading = this.#currentBufferingRange;
    this.#bufferManager = nextBufferManager;

    if (
      this.#currentBufferingRange[1] >= this.#currentBufferingRange[0] &&
      (this.#currentBufferingRange[0] !== 0 ||
        this.#currentBufferingRange[1] !== 0) &&
      this.#bufferManager.containsRange(this.#currentBufferingRange)
    ) {
      this.#currentBufferingRange = [0, 0];
    }

    if (
      buffersEqual(previousLoaded, this.#bufferManager.buffers) &&
      previousLoading[0] === this.#currentBufferingRange[0] &&
      previousLoading[1] === this.#currentBufferingRange[1]
    ) {
      return;
    }

    this.#events.dispatch("timeline:bufferChange", {
      ...this.meta,
      loaded: this.#bufferManager.buffers,
      loading: this.#currentBufferingRange,
    });
  }

  refreshCoverage(): void {
    this.#timeIndex.clear();
    this.#subscribers.forEach((subscriber) => {
      const coverage = subscriber.reportCoverage?.() ?? [];
      if (coverage.length) {
        this.#timeIndex.addTimes(coverage);
      }
    });
  }

  // --- Private helpers ---

  private get meta(): TimelineEventMeta {
    return { timeline: this.name, type: this.#config.type ?? "sequence" };
  }

  private commitSnapshot(snap: TimeSnapshot) {
    this.#snapshot = snap;
    this.#events.dispatch("timeline:timeChange", {
      ...this.meta,
      snapshot: snap,
    });

    this.maybePrefetchAhead(snap.timeInt);
  }

  private getRange(): TimeRange {
    const c = this.#config;
    if (isSequenceConfig(c)) {
      return sequenceRange(c.totalFrames);
    }
    if (isDurationConfig(c)) {
      return [c.defaultTime ?? 0, c.duration] as const;
    }
    // timestamp: stubbed
    throw new Error("Timestamp timelines are not yet supported");
  }

  private setConfig(config: TimelineConfig): void {
    this.#config = Object.freeze({ ...config });
    this.#events.dispatch("timeline:configChange", {
      ...this.meta,
      config: this.#config,
    });
  }

  private setCurrentBufferingRange(range: BufferRange): void {
    this.#currentBufferingRange = range;
    this.#events.dispatch("timeline:bufferChange", {
      ...this.meta,
      loaded: this.#bufferManager.buffers,
      loading: this.#currentBufferingRange,
    });
  }

  private maybePrefetchAhead(time: TimeInt) {
    if (this.#playState !== PLAY_STATE_PLAYING) {
      return;
    }

    const info = {
      config: this.#config,
      range: this.getRange(),
    };

    this.#subscribers.forEach((subscriber) => {
      if (!subscriber.capabilities?.critical || !subscriber.getBufferGoal) {
        return;
      }

      const goal = subscriber.getBufferGoal(time, info);
      if (!goal) {
        return;
      }

      const bufferedRanges = mergeBuffers(
        subscriber.reportBufferedRanges?.() ?? []
      );
      const containingRange = getContainingBufferRange(bufferedRanges, time);
      if (!containingRange || containingRange[1] >= goal.maintain[1]) {
        return;
      }

      const requestedRange = [
        Math.max(info.range[0], containingRange[1] + 1),
        Math.min(info.range[1], goal.refillTo[1]),
      ] as const;

      if (requestedRange[1] < requestedRange[0]) {
        return;
      }

      const inFlightRange = this.#inFlightProactivePrefetches.get(
        subscriber.id
      );
      if (
        inFlightRange &&
        rangesTouchOrOverlap(inFlightRange, requestedRange)
      ) {
        return;
      }

      if (inFlightRange) {
        return;
      }

      this.#inFlightProactivePrefetches.set(subscriber.id, requestedRange);

      void subscriber
        .prefetch?.(requestedRange)
        .catch((error) => {
          console.error(
            `Background prefetch failed for subscriber "${subscriber.id}"`,
            error
          );
        })
        .finally(() => {
          const activeRange = this.#inFlightProactivePrefetches.get(
            subscriber.id
          );

          if (
            activeRange &&
            activeRange[0] === requestedRange[0] &&
            activeRange[1] === requestedRange[1]
          ) {
            this.#inFlightProactivePrefetches.delete(subscriber.id);
          }

          if (!this.#subscribers.has(subscriber.id)) {
            return;
          }

          this.refreshBufferedRanges();
        });
    });
  }
}
