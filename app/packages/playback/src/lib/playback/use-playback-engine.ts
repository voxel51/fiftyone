import { createStore } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  achievedSpeedAtom,
  bufferedRangesAtom,
  currentTimeAtom,
  durationAtom,
  isBufferingAtom,
  isPlayPendingAtom,
  isPlayingAtom,
  loopEndAtom,
  loopStartAtom,
  playheadAtom,
  seekFetchDebounceMsAtom,
  seekEventAtom,
  speedAtom,
  stepIntervalAtom,
  streamRangesVersionAtom,
  viewEndAtom,
  viewStartAtom,
} from "./atoms";
import { MAX_SPEED } from "../constants";
import { clamp, clampAndValidateBounds } from "./utils";
import { createPlaybackRateMeter } from "./playback-rate-meter";
import type {
  PlaybackClockSource,
  PlaybackConfig,
  PlaybackContextValue,
  PlaybackStore,
  PlaybackStream,
} from "./types";

/**
 * Snap a continuous playhead time onto a frame-boundary multiple of
 * `step`, then advance or retreat exactly one displayed frame. Used by
 * stepForward / stepBack so the frame stepper always lands on a
 * boundary regardless of where in a frame's time range the playhead
 * sits — naïvely adding `±step` to a mid-frame playhead would never
 * align (every press just shifts the offset along).
 *
 * "Displayed frame" K is the half-open range `[K*step, (K+1)*step)`.
 * `forward` returns the *next* frame's start, `back` returns the
 * *previous* frame's start — both relative to the currently displayed
 * frame, never to mid-frame fractions.
 *
 * The `eps` tolerance absorbs floating-point error so a playhead set
 * to exactly `K * step` doesn't get misread as `K * step - epsilon`.
 */
function frameBoundaryStep(
  time: number,
  step: number,
  direction: "forward" | "back",
): number {
  if (!(step > 0)) {
    return direction === "forward" ? time + step : time - step;
  }
  const eps = step * 1e-6;
  const currentFrameK = Math.floor((time + eps) / step);
  const targetK =
    direction === "forward" ? currentFrameK + 1 : currentFrameK - 1;
  return targetK * step;
}

/**
 * Snap a continuous playhead time onto the START of the displayed frame it
 * falls within — `floor(time / step) * step`. Unlike {@link frameBoundaryStep}
 * this never advances a frame; it just aligns a mid-frame playhead onto the
 * boundary of the frame currently on screen, so a settle-snap keeps the user
 * on the frame they were looking at. The `eps` tolerance keeps a playhead
 * already at `K * step` from being read as the previous frame.
 */
function displayedFrameStart(time: number, step: number): number {
  if (!(step > 0)) {
    return time;
  }

  const eps = step * 1e-6;
  return Math.floor((time + eps) / step) * step;
}

/**
 * Cap on per-tick `dt` (sec) in the engine's wallclock-driven advance.
 * When the main thread is blocked (memory pressure, GC pause, throttled
 * tab) RAF callbacks pile up and the next `timestamp - lastTimestamp`
 * can be huge. Without a cap, the engine teleports `targetTime`
 * forward by seconds in a single tick — past where any blocking stream
 * has caught up to. The cap turns that into "advance one cap-step,
 * then wait for the barrier to refresh."
 *
 * 0.133s ≈ 4 frames at 30fps. Generous enough to absorb a 100ms GC
 * pause without throttling smooth playback; tight enough that a
 * post-stall tick doesn't overshoot beyond what `bufferState` could
 * meaningfully gate.
 *
 * Only applies in the dt-driven path. When a clock source is
 * registered (e.g. video-anchored playback), the cap is irrelevant
 * because `targetTime` comes from the source directly.
 */
const MAX_TICK_DT_S = 0.133;
const DEFAULT_PREFETCH_LOOKAHEAD_SECONDS = 3;

export function usePlaybackEngine({
  duration = 0,
  stepInterval,
  defaultLoopStart,
  defaultLoopEnd,
  defaultSpeed = 1.0,
  snapToFrameOnSettle = false,
  mode = { kind: "duration" },
  seekFetchDebounceMs = 0,
}: PlaybackConfig = {}): {
  store: PlaybackStore;
  contextValue: PlaybackContextValue;
} {
  // `sequence` mode's fps IS the native step rate, so default the fallback
  // step interval to `1/fps` unless the caller explicitly overrides it —
  // otherwise a caller could declare `mode: { kind: "sequence", fps: 24 }`
  // and still get `1/30` until a stream registers, silently mismatched.
  const resolvedStepInterval =
    stepInterval ?? (mode.kind === "sequence" ? 1 / mode.fps : 1 / 30);

  // The duration / stepInterval props are FALLBACKS when no stream
  // provides them. Stored in refs so the recompute functions can read
  // the latest values without capturing them.
  const fallbackDurationRef = useRef(duration);
  fallbackDurationRef.current = duration;
  const fallbackStepIntervalRef = useRef(resolvedStepInterval);
  fallbackStepIntervalRef.current = resolvedStepInterval;
  const snapToFrameRef = useRef(snapToFrameOnSettle);
  snapToFrameRef.current = snapToFrameOnSettle;

  const store = useMemo(() => {
    const s = createStore();
    const initialDuration = Math.max(0, duration);
    const loopStart = clamp(defaultLoopStart ?? 0, 0, initialDuration);
    const rawLoopEnd = clamp(
      defaultLoopEnd ?? initialDuration,
      0,
      initialDuration,
    );
    // Inverted / collapsed window → fall back to the full timeline so the
    // RAF wrap path isn't trapped in a zero-width loop.
    const loopEnd = rawLoopEnd > loopStart ? rawLoopEnd : initialDuration;
    const initialSpeed =
      Number.isFinite(defaultSpeed) && defaultSpeed > 0 ? defaultSpeed : 1;

    s.set(durationAtom, initialDuration);
    s.set(stepIntervalAtom, resolvedStepInterval);
    s.set(
      seekFetchDebounceMsAtom,
      Number.isFinite(seekFetchDebounceMs) && seekFetchDebounceMs > 0
        ? seekFetchDebounceMs
        : 0,
    );
    s.set(speedAtom, initialSpeed);
    s.set(viewEndAtom, initialDuration);
    s.set(loopStartAtom, loopStart);
    s.set(loopEndAtom, loopEnd);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // store is created once at mount; config is treated as mount-time

  const streamsRef = useRef<Map<string, PlaybackStream>>(new Map());
  const subscribersRef = useRef<Map<string, number>>(new Map());
  const rafIdRef = useRef<number | null>(null);
  const achievedRateMeterRef = useRef(createPlaybackRateMeter());
  // Wallclock at the previous tick. Used for `dt`-driven advance when
  // no clock source is registered. Reset to `null` on play() so the
  // first tick after pause doesn't see a huge gap.
  const lastTimestampRef = useRef<number | null>(null);
  // Optional override for the engine's wallclock advance. When non-null and
  // `read()` returns a number, the engine uses that as the next target time;
  // when `null` or `read()` returns `null`, the engine falls back to dt.
  const clockSourceRef = useRef<PlaybackClockSource | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingPlayStartedAtMsRef = useRef<number | null>(null);
  const pendingPlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const tryStartPendingPlaybackRef = useRef<() => void>(() => undefined);
  const seekFetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // The pending target whose missing-data nudge may run. Null while a
  // configured trailing debounce is still coalescing visual seek updates.
  const seekPrefetchTargetRef = useRef<number | null>(null);
  const seekSeqRef = useRef(0);
  // A seek/step/snap target that couldn't commit immediately because a
  // blocking stream was still buffering. The settle loop (below) polls
  // the barrier for this time while paused and commits once ready.
  const pendingCommitRef = useRef<number | null>(null);
  const settleRafRef = useRef<number | null>(null);

  const clearSeekFetchDebounce = useCallback(() => {
    if (seekFetchDebounceRef.current !== null) {
      clearTimeout(seekFetchDebounceRef.current);
      seekFetchDebounceRef.current = null;
    }
  }, []);

  // A stream is "active" when registered AND has at least one subscriber.
  // Dormant streams (registered but no subscribers) are skipped entirely.
  const isActive = useCallback((id: string): boolean => {
    return (subscribersRef.current.get(id) ?? 0) > 0;
  }, []);

  /**
   * Derive the overall timeline duration from registered streams.
   * `durationAtom = max(fallback, every stream's duration)`. Also keeps
   * `viewEndAtom` and `loopEndAtom` in sync — but only if they were
   * sitting at the previous duration value, which is our signal that
   * the user hasn't customized them. Once the user calls `setView` or
   * `setLoop`, their values stop tracking duration automatically.
   */
  const recomputeDuration = useCallback(() => {
    let max = fallbackDurationRef.current;
    for (const s of streamsRef.current.values()) {
      if (s.duration != null && s.duration > max) max = s.duration;
    }
    const prev = store.get(durationAtom);
    if (prev === max) return;
    store.set(durationAtom, max);
    if (store.get(viewEndAtom) === prev) store.set(viewEndAtom, max);
    if (store.get(loopEndAtom) === prev) store.set(loopEndAtom, max);
  }, [store]);

  /**
   * Derive `stepIntervalAtom` from the registered streams. Picks the
   * smallest `nativeStepSeconds` so stepForward / stepBack lands on a
   * tick even the highest-frequency stream can resolve. Streams that
   * don't declare a native step are ignored. Falls back to the
   * provider's `stepInterval` prop (default `1/30`) when no stream
   * contributes a value.
   */
  const recomputeStepInterval = useCallback(() => {
    let min = Infinity;
    for (const s of streamsRef.current.values()) {
      if (s.nativeStepSeconds != null && s.nativeStepSeconds > 0) {
        if (s.nativeStepSeconds < min) min = s.nativeStepSeconds;
      }
    }
    const next = min === Infinity ? fallbackStepIntervalRef.current : min;
    if (store.get(stepIntervalAtom) !== next) {
      store.set(stepIntervalAtom, next);
    }
  }, [store]);

  const fireSeekEvent = useCallback(
    (time: number) => {
      seekSeqRef.current += 1;
      store.set(seekEventAtom, { time, seq: seekSeqRef.current });
    },
    [store],
  );

  const doCommit = useCallback(
    (time: number) => {
      store.set(currentTimeAtom, time);
      for (const s of streamsRef.current.values()) {
        if (!isActive(s.id)) continue;
        s.onCommit?.(time, store);
      }
    },
    [store, isActive],
  );

  /**
   * Readiness barrier for `targetTime`. Every blocking, subscribed
   * stream must be ready before the engine commits; streams reporting
   * `missing` get a prefetch nudge, `loading` is already in flight.
   * Publishes `isBufferingAtom` and returns whether all are ready.
   *
   * Shared by the playing RAF tick and the paused settle loop so a seek
   * while paused gets the same prefetch nudge that playback would give
   * it — otherwise streams that fetch only via this nudge would
   * never request the seeked frame until the user hit play.
   */
  const runBarrier = useCallback(
    (targetTime: number, requestMissing = true): boolean => {
      const duration = store.get(durationAtom);
      let isBuffering = false;

      for (const s of streamsRef.current.values()) {
        if (!s.blocking) {
          continue;
        }

        if (!isActive(s.id)) {
          continue;
        }

        const state = s.bufferState(targetTime);
        if (state === "ready") {
          continue;
        }

        isBuffering = true;
        if (requestMissing && state === "missing") {
          s.prefetch?.([
            targetTime,
            Math.min(duration, targetTime + (s.lookaheadSeconds ?? 3)),
          ]);
        }
      }

      store.set(isBufferingAtom, isBuffering);

      return !isBuffering;
    },
    [store, isActive],
  );

  /**
   * Engine RAF tick. Two modes, chosen per tick based on whether a
   * `PlaybackClockSource` has been registered via `setClockSource`:
   *
   * - **Default (wallclock-driven, no clock source)**: advance
   *   `playhead` by capped `dt`. Gate the commit on all blocking
   *   subscribed streams reporting ready at `targetTime`. This is the
   *   general-purpose model — label-only timelines, image-sequence
   *   playback, sensor data, multi-stream coordinated playback all
   *   live here. The engine is the authority on time; streams
   *   contribute readiness.
   *
   * - **External clock (with registered clock source)**: `targetTime`
   *   comes from `clockSourceRef.current.read()`. The engine doesn't
   *   compute `dt`; it observes whatever time the source reports and
   *   commits gated on the same barrier check. Use this for the
   *   video-anchored case where the `<video>` element's actual
   *   presentation time should drive the timeline (avoids the
   *   wallclock-vs-decoder race).
   *
   * If a registered clock source returns `null` (no opinion this
   * tick — e.g. video hasn't presented a first frame yet), we fall
   * back to the dt path for that tick. So the modes compose: the
   * presence of a source doesn't disable dt; only an actual value
   * does.
   */
  const tick = useCallback(
    (timestamp: number) => {
      // Capture first timestamp so the first tick after a pause/seek
      // doesn't see a huge dt spike.
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
        achievedRateMeterRef.current.reset(timestamp);
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const speed = store.get(speedAtom);
      const currentTime = store.get(playheadAtom);
      const loopStart = store.get(loopStartAtom);
      const loopEnd = store.get(loopEndAtom);

      const externalTime = clockSourceRef.current?.read() ?? null;

      let rawNext: number;
      if (externalTime !== null) {
        // External clock owns the timeline
        rawNext = externalTime;
        lastTimestampRef.current = timestamp;
      } else {
        // dt-driven advance. Cap to absorb main-thread blocks.
        const rawDt = (timestamp - lastTimestampRef.current) / 1000;
        const cappedDt = Math.min(rawDt, MAX_TICK_DT_S);
        const dt = cappedDt * speed;
        lastTimestampRef.current = timestamp;
        rawNext = currentTime + dt;
      }

      const willWrap = rawNext >= loopEnd;
      const targetTime = willWrap ? loopStart : rawNext;

      let committedMediaSeconds = 0;
      if (runBarrier(targetTime)) {
        // Active playback has accepted a newer target, so any paused-seek
        // debounce still pointing at an older target is obsolete.
        pendingCommitRef.current = null;
        seekPrefetchTargetRef.current = null;
        clearSeekFetchDebounce();
        store.set(playheadAtom, targetTime);
        doCommit(targetTime);
        committedMediaSeconds = willWrap
          ? Math.max(0, loopEnd - currentTime) +
            Math.max(0, targetTime - loopStart)
          : Math.max(0, targetTime - currentTime);
        // Loop-wrap is a discontinuous jump — fire immediately so
        // streams can flush their cache and buffer around loopStart.
        if (willWrap) fireSeekEvent(loopStart);
      }

      const achievedSpeed = achievedRateMeterRef.current.sample(
        timestamp,
        committedMediaSeconds,
      );
      if (achievedSpeed !== null) {
        store.set(achievedSpeedAtom, achievedSpeed);
      }

      rafIdRef.current = requestAnimationFrame(tick);
    },
    [clearSeekFetchDebounce, store, fireSeekEvent, doCommit, runBarrier],
  );

  useEffect(() => {
    const unsub = store.sub(isPlayingAtom, () => {
      const isPlaying = store.get(isPlayingAtom);
      if (isPlaying) {
        lastTimestampRef.current = null;
        achievedRateMeterRef.current.reset();
        store.set(achievedSpeedAtom, null);
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        achievedRateMeterRef.current.reset();
        store.set(achievedSpeedAtom, null);
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      }
    });
    return () => {
      unsub();
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);

      if (settleRafRef.current !== null) {
        cancelAnimationFrame(settleRafRef.current);
        settleRafRef.current = null;
      }

      clearSeekFetchDebounce();
    };
  }, [clearSeekFetchDebounce, store, tick]);

  /**
   * Paused settle loop. A `seek`/`step`/snap into an unbuffered region
   * can't commit immediately, and the RAF tick that re-runs the barrier
   * only runs while playing — so without this the playhead would move
   * but `currentTimeAtom` would never advance: streams keep showing the
   * old frame. This polls the barrier for the pending target while paused and
   * commits once it's ready. Playing hands the duty back to the RAF tick.
   */
  const settleTick = useCallback(() => {
    settleRafRef.current = null;
    const time = pendingCommitRef.current;

    if (time === null || store.get(isPlayingAtom)) {
      return;
    }

    const mayRequestMissing = seekPrefetchTargetRef.current === time;
    if (runBarrier(time, mayRequestMissing)) {
      pendingCommitRef.current = null;
      seekPrefetchTargetRef.current = null;
      clearSeekFetchDebounce();
      doCommit(time);
      return;
    }

    settleRafRef.current = requestAnimationFrame(settleTick);
  }, [clearSeekFetchDebounce, store, runBarrier, doCommit]);

  const clearPendingPlayTimeout = useCallback(() => {
    if (pendingPlayTimeoutRef.current === null) return;
    clearTimeout(pendingPlayTimeoutRef.current);
    pendingPlayTimeoutRef.current = null;
  }, []);

  const schedulePendingPlayTimeout = useCallback(() => {
    clearPendingPlayTimeout();
    const startedAtMs = pendingPlayStartedAtMsRef.current;
    if (!pendingPlayRef.current || startedAtMs === null) return;

    const nowMs = performance.now();
    let nextWaitMs = Number.POSITIVE_INFINITY;
    for (const stream of streamsRef.current.values()) {
      if (!stream.blocking || !isActive(stream.id)) continue;
      const deadlineMs = startupCoverageDeadlineMs(stream, startedAtMs);
      if (deadlineMs === null) continue;
      const remainingMs = deadlineMs - nowMs;
      // An expired stream is already handled by evaluatePlaybackStart. Do
      // not let it pin the scheduler to a zero-delay loop while another
      // blocking stream still has a later deadline.
      if (remainingMs <= 0) continue;
      nextWaitMs = Math.min(nextWaitMs, remainingMs);
    }

    if (!Number.isFinite(nextWaitMs)) return;
    pendingPlayTimeoutRef.current = setTimeout(() => {
      pendingPlayTimeoutRef.current = null;
      tryStartPendingPlaybackRef.current();
    }, Math.ceil(nextWaitMs));
  }, [clearPendingPlayTimeout, isActive]);

  const evaluatePlaybackStart = useCallback(
    (time: number, requestMissing: boolean): boolean => {
      const duration = store.get(durationAtom);
      const pendingStartedAtMs = pendingPlayStartedAtMsRef.current;
      const nowMs = performance.now();
      let activeBlockingStreams = 0;
      let ready = true;

      for (const s of streamsRef.current.values()) {
        if (!s.blocking) continue;
        if (!isActive(s.id)) continue;
        activeBlockingStreams += 1;

        const state = s.bufferState(time);
        const currentReady = state === "ready";
        const startupReady =
          currentReady &&
          (streamHasStartupCoverage(s, time, duration) ||
            startupCoverageWaitExpired(s, pendingStartedAtMs, nowMs));

        if (currentReady && startupReady) continue;

        ready = false;
        if (requestMissing) {
          s.prefetch?.([time, startupPrefetchEnd(s, time, duration)]);
        }
      }

      if (activeBlockingStreams === 0 && duration <= 0) return false;

      return ready;
    },
    [isActive, store],
  );

  const clearPendingPlay = useCallback(
    (clearBuffering = false) => {
      pendingPlayRef.current = false;
      pendingPlayStartedAtMsRef.current = null;
      clearPendingPlayTimeout();
      store.set(isPlayPendingAtom, false);
      if (clearBuffering) store.set(isBufferingAtom, false);
    },
    [clearPendingPlayTimeout, store],
  );

  const startPlayback = useCallback(() => {
    clearPendingPlay(true);
    store.set(isPlayingAtom, true);
  }, [clearPendingPlay, store]);

  const requestOrStartPlayback = useCallback(
    (time: number) => {
      pendingPlayStartedAtMsRef.current ??= performance.now();
      if (evaluatePlaybackStart(time, true)) {
        startPlayback();
        return;
      }

      pendingPlayRef.current = true;
      store.set(isPlayPendingAtom, true);
      store.set(isBufferingAtom, true);
      schedulePendingPlayTimeout();
    },
    [evaluatePlaybackStart, schedulePendingPlayTimeout, startPlayback, store],
  );

  const tryStartPendingPlayback = useCallback(() => {
    if (!pendingPlayRef.current) return;
    if (store.get(isPlayingAtom)) {
      clearPendingPlay();
      return;
    }

    const time = store.get(playheadAtom);
    if (evaluatePlaybackStart(time, false)) {
      startPlayback();
      return;
    }

    evaluatePlaybackStart(time, true);
    schedulePendingPlayTimeout();
  }, [
    clearPendingPlay,
    evaluatePlaybackStart,
    schedulePendingPlayTimeout,
    startPlayback,
    store,
  ]);
  tryStartPendingPlaybackRef.current = tryStartPendingPlayback;

  useEffect(() => {
    const unsubscribeBufferedRanges = store.sub(
      bufferedRangesAtom,
      tryStartPendingPlayback,
    );
    const unsubscribeStreamRanges = store.sub(
      streamRangesVersionAtom,
      tryStartPendingPlayback,
    );
    return () => {
      unsubscribeBufferedRanges();
      unsubscribeStreamRanges();
    };
  }, [store, tryStartPendingPlayback]);

  // This effect clears a pending startup deadline when the engine unmounts.
  useEffect(
    () => () => {
      clearPendingPlayTimeout();
    },
    [clearPendingPlayTimeout],
  );

  /**
   * Releases the latest coalesced seek target into the data plane. A stale
   * timer is harmless: only the current pending target may request data.
   */
  const releaseSeekFetch = useCallback(
    (time: number) => {
      if (pendingCommitRef.current !== time) return;

      seekPrefetchTargetRef.current = time;
      if (runBarrier(time, true)) {
        pendingCommitRef.current = null;
        seekPrefetchTargetRef.current = null;
        clearSeekFetchDebounce();
        doCommit(time);
        return;
      }

      if (!store.get(isPlayingAtom) && settleRafRef.current === null) {
        settleRafRef.current = requestAnimationFrame(settleTick);
      }
    },
    [clearSeekFetchDebounce, doCommit, runBarrier, settleTick, store],
  );

  /**
   * Commit `time` now if the barrier is satisfied, else remember it and
   * let {@link settleTick} commit it once streams finish buffering. Missing
   * streams may be nudged immediately or after the configured trailing
   * debounce; already-buffered targets always commit synchronously.
   */
  const commitWhenReady = useCallback(
    (time: number, immediateFetch = false) => {
      clearSeekFetchDebounce();
      pendingCommitRef.current = time;

      const debounceMs = store.get(seekFetchDebounceMsAtom);
      const requestMissing = immediateFetch || debounceMs <= 0;
      seekPrefetchTargetRef.current = requestMissing ? time : null;
      if (!requestMissing) {
        seekFetchDebounceRef.current = setTimeout(() => {
          seekFetchDebounceRef.current = null;
          releaseSeekFetch(time);
        }, debounceMs);
      }

      if (runBarrier(time, requestMissing)) {
        pendingCommitRef.current = null;
        seekPrefetchTargetRef.current = null;
        clearSeekFetchDebounce();
        doCommit(time);
        return;
      }

      if (settleRafRef.current === null) {
        settleRafRef.current = requestAnimationFrame(settleTick);
      }
    },
    [
      clearSeekFetchDebounce,
      doCommit,
      releaseSeekFetch,
      runBarrier,
      settleTick,
      store,
    ],
  );

  const actions = useMemo(() => {
    // Settle-snap: align the playhead to the displayed frame's start. No-op
    // unless `snapToFrameOnSettle` is configured, so general playback keeps
    // continuous scrubbing — only the resting position after pause / drag-end
    // is snapped, never the mid-drag `seek`s. Mirrors `seek`'s set →
    // fireSeekEvent → commit-if-ready flow so buffering is respected.
    const snapPlayheadToFrame = () => {
      if (!snapToFrameRef.current) {
        return;
      }

      const step = store.get(stepIntervalAtom);
      if (!(step > 0)) {
        return;
      }

      const current = store.get(playheadAtom);
      const snapped = clamp(
        displayedFrameStart(current, step),
        0,
        store.get(durationAtom),
      );

      if (Math.abs(snapped - current) < step * 1e-6) {
        // A drag may already have landed exactly on a frame boundary. Treat
        // its settle call as an explicit flush even though no visual move is
        // needed.
        if (pendingCommitRef.current === current) {
          commitWhenReady(current, true);
        }
        return;
      }

      store.set(playheadAtom, snapped);
      fireSeekEvent(snapped);
      commitWhenReady(snapped, true);
    };

    return {
      snapPlayheadToFrame,
      seek: (time: number) => {
        const clamped = clamp(time, 0, store.get(durationAtom));
        store.set(playheadAtom, clamped);
        fireSeekEvent(clamped);
        commitWhenReady(clamped);
        if (pendingPlayRef.current) requestOrStartPlayback(clamped);
      },
      // Snapping companion to `seek`. Quantizes `time` onto the displayed-
      // frame start when the provider has opted into `snapToFrameOnSettle`;
      // otherwise behaves exactly like `seek`. The play-loop RAF tick MUST
      // stay on plain `seek` (continuous sub-frame times) — this entry point
      // is for human-driven scrub paths (playhead drag, lane click-to-seek)
      // where users want the playhead to track discrete frame numbers
      // continuously instead of only on drag-end settle.
      seekSnapped: (time: number) => {
        const clamped = clamp(time, 0, store.get(durationAtom));
        const step = store.get(stepIntervalAtom);

        if (!snapToFrameRef.current || step <= 0) {
          // pass-through to normal seek behavior
          if (clamped === store.get(playheadAtom)) return;
          store.set(playheadAtom, clamped);
          fireSeekEvent(clamped);
          commitWhenReady(clamped);
          if (pendingPlayRef.current) requestOrStartPlayback(clamped);
          return;
        }

        const current = store.get(playheadAtom);
        // Nearest-anchor snap: round the cursor time to the closest frame
        // anchor `K * step`. This is symmetric on BOTH the seconds axis
        // and the visual axis. The playhead RENDERS at the start of frame
        // K's cell (i.e. at `K * step`), so a floor-based cell snap was
        // visually asymmetric — dragging one cell-width left put the
        // cursor at the cell-start of the previous anchor (snap = 1 frame
        // backward, but the playhead had already been visually sitting at
        // the upper boundary of that cell, so the user perceived a 2-cell
        // jump). Rounding to the nearest anchor makes the visual delta
        // match the logical delta in both directions:
        //   playhead at T_K, cursor at T_K + step → round → snap to T_{K+1}
        //   playhead at T_K, cursor at T_K - step → round → snap to T_{K-1}
        // Half-step ties round toward +Infinity per JS `Math.round`, so
        // an exact midpoint cursor tips forward — deterministic and
        // imperceptible in practice (sub-frame mouse precision).
        const snapped = Math.round(clamped / step) * step;

        // Early-return when the snap result matches the current playhead —
        // happens on every sub-frame drag delta that stays within the same
        // cell as the current playhead.
        if (snapped === current) return;

        store.set(playheadAtom, snapped);
        fireSeekEvent(snapped);
        commitWhenReady(snapped);
        if (pendingPlayRef.current) requestOrStartPlayback(snapped);
      },
      play: () => {
        let current = store.get(playheadAtom);
        const ls = store.get(loopStartAtom);
        const le = store.get(loopEndAtom);
        if (current < ls || current >= le) {
          current = ls;
          store.set(playheadAtom, current);
          fireSeekEvent(current);
        }
        requestOrStartPlayback(current);
      },
      pause: () => {
        const wasPending = pendingPlayRef.current;
        clearPendingPlay(wasPending);
        store.set(isPlayingAtom, false);
        snapPlayheadToFrame();
      },
      stepBack: () => {
        const next = clamp(
          frameBoundaryStep(
            store.get(playheadAtom),
            store.get(stepIntervalAtom),
            "back",
          ),
          0,
          store.get(durationAtom),
        );
        store.set(playheadAtom, next);
        fireSeekEvent(next);
        commitWhenReady(next, true);
        if (pendingPlayRef.current) requestOrStartPlayback(next);
      },
      stepForward: () => {
        const next = clamp(
          frameBoundaryStep(
            store.get(playheadAtom),
            store.get(stepIntervalAtom),
            "forward",
          ),
          0,
          store.get(durationAtom),
        );
        store.set(playheadAtom, next);
        fireSeekEvent(next);
        commitWhenReady(next, true);
        if (pendingPlayRef.current) requestOrStartPlayback(next);
      },
      setView: (start: number, end: number) => {
        const bounds = clampAndValidateBounds(
          start,
          end,
          store.get(durationAtom),
        );
        if (!bounds) return;
        store.set(viewStartAtom, bounds.start);
        store.set(viewEndAtom, bounds.end);
      },
      setLoop: (start: number, end: number) => {
        const bounds = clampAndValidateBounds(
          start,
          end,
          store.get(durationAtom),
        );
        if (!bounds) return;
        store.set(loopStartAtom, bounds.start);
        store.set(loopEndAtom, bounds.end);
      },
      setSpeed: (speed: number) => {
        // NaN / Infinity / non-positive values would corrupt `dt` in
        // the RAF tick and produce invalid playhead progression.
        if (!Number.isFinite(speed) || speed <= 0) return;
        // Clamp (not reject) the upper bound so callers that pass an
        // out-of-range value land at MAX_SPEED rather than silently no-op.
        store.set(speedAtom, Math.min(speed, MAX_SPEED));
        // When a clock source is registered, the engine's `dt` arithmetic
        // isn't running — the source already paces the timeline. Speed in that
        // mode has to be applied at the source (e.g. `v.playbackRate` for a
        // video clock source).
      },
      registerStream: (stream: PlaybackStream) => {
        streamsRef.current.set(stream.id, stream);
        recomputeDuration();
        recomputeStepInterval();
        return () => {
          // Identity check: if the same id has been replaced with a newer
          // stream instance, an older cleanup shouldn't yank it out.
          if (streamsRef.current.get(stream.id) === stream) {
            streamsRef.current.delete(stream.id);
            recomputeDuration();
            recomputeStepInterval();
          }
        };
      },
      subscribeStream: (id: string) => {
        subscribersRef.current.set(
          id,
          (subscribersRef.current.get(id) ?? 0) + 1,
        );
        tryStartPendingPlayback();
        // One-shot cleanup. StrictMode's setup→cleanup→setup cycle (and
        // any consumer that retains a stale cleanup) would otherwise
        // double-decrement and drop a still-mounted stream.
        let disposed = false;
        return () => {
          if (disposed) return;
          disposed = true;
          const next = (subscribersRef.current.get(id) ?? 1) - 1;
          if (next <= 0) {
            subscribersRef.current.delete(id);
          } else {
            subscribersRef.current.set(id, next);
          }
        };
      },
      setClockSource: (source: PlaybackClockSource | null) => {
        clockSourceRef.current = source;
        // Reset the dt anchor so a switch back to wallclock mode
        // doesn't see a huge gap accumulated while the source was
        // driving.
        lastTimestampRef.current = null;
        return () => {
          // Identity guard: a stale cleanup from a previous source
          // shouldn't yank out a newer one.
          if (clockSourceRef.current === source) {
            clockSourceRef.current = null;
            lastTimestampRef.current = null;
          }
        };
      },
    };
  }, [
    store,
    fireSeekEvent,
    clearPendingPlay,
    commitWhenReady,
    recomputeDuration,
    recomputeStepInterval,
    requestOrStartPlayback,
    tryStartPendingPlayback,
  ]);

  const contextValue = useMemo<PlaybackContextValue>(
    () => ({ duration, stepInterval: resolvedStepInterval, ...actions }),
    [duration, resolvedStepInterval, actions],
  );

  return { store, contextValue };
}

function streamHasStartupCoverage(
  stream: PlaybackStream,
  time: number,
  duration: number,
): boolean {
  const startupSeconds = stream.startupBufferSeconds ?? 0;
  if (startupSeconds <= 0) return true;

  const ranges = stream.bufferedRanges?.();
  if (!ranges) return true;

  return rangesCoverInterval(
    ranges,
    time,
    Math.min(duration, time + startupSeconds),
    startupCoverageStartTolerance(stream),
  );
}

function startupCoverageWaitExpired(
  stream: PlaybackStream,
  pendingStartedAtMs: number | null,
  nowMs: number,
): boolean {
  const deadlineMs = startupCoverageDeadlineMs(stream, pendingStartedAtMs);
  return deadlineMs !== null && nowMs >= deadlineMs;
}

function startupCoverageDeadlineMs(
  stream: PlaybackStream,
  pendingStartedAtMs: number | null,
): number | null {
  const maxWaitSeconds = stream.startupBufferMaxWaitSeconds;
  if (
    pendingStartedAtMs === null ||
    maxWaitSeconds === undefined ||
    !Number.isFinite(maxWaitSeconds) ||
    maxWaitSeconds < 0
  ) {
    return null;
  }
  return pendingStartedAtMs + maxWaitSeconds * 1_000;
}

function startupCoverageStartTolerance(stream: PlaybackStream): number {
  const nativeStep = stream.nativeStepSeconds;
  return nativeStep !== undefined &&
    Number.isFinite(nativeStep) &&
    nativeStep > 0
    ? nativeStep / 2
    : 0;
}

function startupPrefetchEnd(
  stream: PlaybackStream,
  time: number,
  duration: number,
): number {
  const lookaheadSeconds = Math.max(
    stream.startupBufferSeconds ?? 0,
    stream.lookaheadSeconds ?? DEFAULT_PREFETCH_LOOKAHEAD_SECONDS,
  );
  return Math.min(duration, time + lookaheadSeconds);
}

function rangesCoverInterval(
  ranges: ReturnType<NonNullable<PlaybackStream["bufferedRanges"]>>,
  start: number,
  end: number,
  startTolerance = 0,
): boolean {
  if (end <= start) return true;

  for (const [rangeStart, rangeEnd] of ranges) {
    if (rangeStart <= start + startTolerance && rangeEnd >= end) return true;
    if (rangeStart > start) return false;
  }

  return false;
}
