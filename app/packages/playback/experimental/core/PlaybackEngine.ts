import { TimeIndex } from "./TimeIndex";
import { createSnapshot } from "./TimeSnapshot";
import { clampTime, quantize } from "./TimeValue";
import type {
  LoopMode,
  PlayState,
  Subscriber,
  TimeInt,
  TimelineConfig,
  TimelineName,
  TimelineRenderContext,
  TimelineType,
  TimeRange,
  TimeSnapshot,
} from "../types";
import {
  DEFAULT_SPEED,
  DEFAULT_TICK_RATE,
  MIN_LOAD_RANGE_DURATION_NS,
} from "../constants";

export interface PlaybackEngineOptions {
  getConfig: () => TimelineConfig;
  getRange: () => TimeRange;
  getSnapshot: () => TimeSnapshot;
  getPlayState: () => PlayState;
  getSubscribers: () => Map<string, Subscriber>;
  getTimeIndex: () => TimeIndex;
  commitSnapshot: (snapshot: TimeSnapshot) => void;
  onPlayStateChange: (state: PlayState) => void;
  onBufferRequest: (range: TimeRange) => void;
  timelineName: TimelineName;
  timelineType: TimelineType;
}

/**
 * Owns the `requestAnimationFrame` loop with a two-phase commit protocol.
 *
 * Stateless — reads/writes via constructor callbacks so the TimelineManager
 * remains the single source of truth.
 */
export class PlaybackEngine {
  private _animationId = -1;
  private _isRunning = false;
  private _lastDrawTime = -1;
  private _hasCommittedSinceStart = false;
  private _activeRequest: {
    snapshot: TimeSnapshot;
    abortController: AbortController;
  } | null = null;
  private _queuedRequest: TimeSnapshot | null = null;

  private readonly opts: PlaybackEngineOptions;

  constructor(options: PlaybackEngineOptions) {
    this.opts = options;
  }

  /** Whether the rAF loop is currently active. */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Start the animation loop. */
  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this._lastDrawTime = performance.now();
    this._hasCommittedSinceStart = false;
    this._animationId = requestAnimationFrame(this.tick);
  }

  /** Stop the animation loop. */
  stop(): void {
    if (!this._isRunning) return;
    cancelAnimationFrame(this._animationId);
    this._isRunning = false;
    this._lastDrawTime = -1;
    this._hasCommittedSinceStart = false;
    this._queuedRequest = null;
    this._activeRequest?.abortController.abort();
    this._activeRequest = null;
  }

  /** Stop and release resources. */
  destroy(): void {
    this.stop();
  }

  // --- Private ---

  private tick = (now: DOMHighResTimeStamp): void => {
    if (!this._isRunning) return;

    const config = this.opts.getConfig();
    const speed = config.speed ?? DEFAULT_SPEED;
    const tickRate = config.tickRate ?? DEFAULT_TICK_RATE;
    const updateInterval =
      this.opts.timelineType === "duration"
        ? 1000 / tickRate
        : 1000 / (tickRate * speed);

    const elapsed = now - this._lastDrawTime;
    if (elapsed < updateInterval) {
      this._animationId = requestAnimationFrame(this.tick);
      return;
    }

    this._lastDrawTime = now - (elapsed % updateInterval);

    const currentSnapshot = this.opts.getSnapshot();
    const range = this.opts.getRange();
    const type = this.opts.timelineType;

    // Compute target time
    let targetTimeInt: TimeInt;
    let targetTimeReal: TimeInt;
    if (type === "sequence") {
      targetTimeReal = currentSnapshot.timeReal + 1;
      targetTimeInt = currentSnapshot.timeInt + 1;
    } else {
      // duration: advance by elapsed real time scaled by speed
      const elapsedNanos = elapsed * speed * 1e6;
      targetTimeReal = currentSnapshot.timeReal + elapsedNanos;
      targetTimeInt = quantize(targetTimeReal, type);
    }

    // End-of-range handling
    if (targetTimeInt > range[1]) {
      const loopMode = normalizeLoopMode(config.loop);
      const shouldCommitEndBeforeStopping = currentSnapshot.timeInt < range[1];
      const shouldRestartFromBeginning =
        loopMode === "none" &&
        !this._hasCommittedSinceStart &&
        currentSnapshot.timeInt >= range[1];

      if (loopMode === "loop" || shouldRestartFromBeginning) {
        targetTimeInt = range[0];
        targetTimeReal = range[0];
      } else if (loopMode === "ping-pong") {
        // Stub: for now treat like loop
        targetTimeInt = range[0];
        targetTimeReal = range[0];
      } else if (shouldCommitEndBeforeStopping) {
        targetTimeInt = range[1];
        targetTimeReal = range[1];
      } else {
        // No loop — pause
        this.stop();
        this.opts.onPlayStateChange("paused");
        return;
      }
    }

    targetTimeInt = clampTime(targetTimeInt, range);

    // --- PHASE 1: CHECK (critical subscribers) ---
    const subscribers = this.opts.getSubscribers();

    for (const sub of subscribers.values()) {
      if (sub.capabilities?.critical && sub.bufferState) {
        const readiness = sub.bufferState(targetTimeInt);
        if (readiness !== "ready") {
          // Enter buffering — request prefetch from all subscribers
          this.opts.onPlayStateChange("buffering");
          const prefetchRange: TimeRange =
            type === "duration"
              ? ([
                  Math.max(
                    range[0],
                    targetTimeInt - MIN_LOAD_RANGE_DURATION_NS / 2
                  ),
                  Math.min(
                    range[1],
                    targetTimeInt + MIN_LOAD_RANGE_DURATION_NS
                  ),
                ] as const)
              : ([
                  targetTimeInt,
                  Math.min(targetTimeInt + 100, range[1]),
                ] as const);
          this.opts.onBufferRequest(prefetchRange);

          for (const s of subscribers.values()) {
            s.prefetch?.(prefetchRange);
          }

          // Reschedule — we'll retry on the next tick
          this._animationId = requestAnimationFrame(this.tick);
          return;
        }
      }
    }

    const snapshot = createSnapshot(
      this.opts.timelineName,
      targetTimeInt,
      targetTimeReal
    );
    this.enqueueCommit(snapshot);

    this._animationId = requestAnimationFrame(this.tick);
  };

  private enqueueCommit(snapshot: TimeSnapshot) {
    if (!this._activeRequest) {
      this.startCommit(snapshot);
      return;
    }

    if (!this._queuedRequest) {
      this._queuedRequest = snapshot;
      return;
    }

    this._queuedRequest = snapshot;
    this._activeRequest.abortController.abort();
  }

  private startCommit(snapshot: TimeSnapshot) {
    const abortController = new AbortController();
    this._activeRequest = {
      snapshot,
      abortController,
    };
    const subscribers = this.opts.getSubscribers();
    const context: TimelineRenderContext = {
      reason: "play",
      abortSignal: abortController.signal,
      allowStaleDrop: true,
    };

    const finalize = () => {
      const queuedRequest = this._queuedRequest;
      this._activeRequest = null;
      this._queuedRequest = null;
      if (queuedRequest && this._isRunning) {
        this.startCommit(queuedRequest);
      }
    };

    const commitSnapshot = () => {
      if (abortController.signal.aborted) {
        finalize();
        return;
      }

      if (this.opts.getPlayState() === "buffering") {
        this.opts.onPlayStateChange("playing");
      }

      this.opts.commitSnapshot(snapshot);
      this._hasCommittedSinceStart = true;

      for (const sub of subscribers.values()) {
        try {
          sub.renderAt(snapshot, context);
        } catch (err) {
          console.error(`Subscriber "${sub.id}" renderAt error:`, err);
        }
      }

      finalize();
    };

    const asyncPrepares: Promise<void>[] = [];
    for (const sub of subscribers.values()) {
      if (!sub.capabilities?.critical || !sub.prepareAt) {
        continue;
      }

      try {
        const result = sub.prepareAt(snapshot, context);
        if (
          result &&
          typeof (result as PromiseLike<void>).then === "function"
        ) {
          asyncPrepares.push(Promise.resolve(result));
        }
      } catch (err) {
        console.error(`Subscriber "${sub.id}" prepareAt error:`, err);
      }
    }

    if (!asyncPrepares.length) {
      commitSnapshot();
      return;
    }

    void Promise.all(asyncPrepares)
      .then(() => {
        commitSnapshot();
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          console.error("Failed to prepare playback snapshot", error);
        }
        finalize();
      });
  }
}

function normalizeLoopMode(loop: boolean | LoopMode | undefined): LoopMode {
  if (loop === true) return "loop";
  if (loop === false || loop === undefined) return "none";
  return loop;
}
