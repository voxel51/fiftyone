import { createStore } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  currentTimeAtom,
  durationAtom,
  isBufferingAtom,
  isPlayingAtom,
  loopEndAtom,
  loopStartAtom,
  playheadAtom,
  seekEventAtom,
  speedAtom,
  stepIntervalAtom,
  viewEndAtom,
  viewStartAtom,
} from "./atoms";
import { SEEK_BAR_DEBOUNCE } from "../constants";
import { clamp, clampAndValidateBounds } from "./utils";
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

export function usePlaybackEngine({
  duration = 0,
  stepInterval = 1 / 30,
  defaultLoopStart,
  defaultLoopEnd,
  defaultSpeed = 1.0,
  snapToFrameOnSettle = false,
}: PlaybackConfig = {}): {
  store: PlaybackStore;
  contextValue: PlaybackContextValue;
} {
  // The duration / stepInterval props are FALLBACKS when no stream
  // provides them. Stored in refs so the recompute functions can read
  // the latest values without capturing them.
  const fallbackDurationRef = useRef(duration);
  fallbackDurationRef.current = duration;
  const fallbackStepIntervalRef = useRef(stepInterval);
  fallbackStepIntervalRef.current = stepInterval;
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
    s.set(stepIntervalAtom, stepInterval);
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
  // Wallclock at the previous tick. Used for `dt`-driven advance when
  // no clock source is registered. Reset to `null` on play() so the
  // first tick after pause doesn't see a huge gap.
  const lastTimestampRef = useRef<number | null>(null);
  // Optional override for the engine's wallclock advance. When non-null and
  // `read()` returns a number, the engine uses that as the next target time;
  // when `null` or `read()` returns `null`, the engine falls back to dt.
  const clockSourceRef = useRef<PlaybackClockSource | null>(null);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekSeqRef = useRef(0);
  // A seek/step/snap target that couldn't commit immediately because a
  // blocking stream was still buffering. The settle loop (below) polls
  // the barrier for this time while paused and commits once ready.
  const pendingCommitRef = useRef<number | null>(null);
  const settleRafRef = useRef<number | null>(null);

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
    (time: number, immediate = false) => {
      const fire = () => {
        seekSeqRef.current += 1;
        store.set(seekEventAtom, { time, seq: seekSeqRef.current });
      };
      if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
      if (immediate) {
        fire();
      } else {
        // Debounced so streams don't thrash their caches during rapid scrubbing.
        seekDebounceRef.current = setTimeout(fire, SEEK_BAR_DEBOUNCE);
      }
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
    (targetTime: number): boolean => {
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
        if (state === "missing") {
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

      if (runBarrier(targetTime)) {
        store.set(playheadAtom, targetTime);
        doCommit(targetTime);
        // Loop-wrap is a discontinuous jump — fire immediately so
        // streams can flush their cache and buffer around loopStart.
        if (willWrap) fireSeekEvent(loopStart, true);
      }

      rafIdRef.current = requestAnimationFrame(tick);
    },
    [store, fireSeekEvent, doCommit, runBarrier],
  );

  useEffect(() => {
    const unsub = store.sub(isPlayingAtom, () => {
      const isPlaying = store.get(isPlayingAtom);
      if (isPlaying) {
        lastTimestampRef.current = null;
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
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

      // A queued seek-event timeout could otherwise fire after unmount and
      // touch an orphaned store.
      if (seekDebounceRef.current !== null) {
        clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = null;
      }
    };
  }, [store, tick]);

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

    if (runBarrier(time)) {
      pendingCommitRef.current = null;
      doCommit(time);
      return;
    }

    settleRafRef.current = requestAnimationFrame(settleTick);
  }, [store, runBarrier, doCommit]);

  /**
   * Commit `time` now if the barrier is satisfied, else remember it and
   * let {@link settleTick} commit it once streams finish buffering.
   */
  const commitWhenReady = useCallback(
    (time: number) => {
      pendingCommitRef.current = time;

      if (runBarrier(time)) {
        pendingCommitRef.current = null;
        doCommit(time);
        return;
      }

      if (settleRafRef.current === null) {
        settleRafRef.current = requestAnimationFrame(settleTick);
      }
    },
    [runBarrier, doCommit, settleTick],
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
        return;
      }

      store.set(playheadAtom, snapped);
      fireSeekEvent(snapped, true);
      commitWhenReady(snapped);
    };

    return {
      snapPlayheadToFrame,
      seek: (time: number) => {
        const clamped = clamp(time, 0, store.get(durationAtom));
        store.set(playheadAtom, clamped);
        fireSeekEvent(clamped);
        commitWhenReady(clamped);
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
        const snapped =
          snapToFrameRef.current && step > 0
            ? displayedFrameStart(clamped, step)
            : clamped;
        // Skip redundant set/commit churn when the snap result already
        // matches the current playhead — happens on every sub-frame drag
        // delta once the playhead has landed on a boundary.
        if (snapped === store.get(playheadAtom)) return;
        store.set(playheadAtom, snapped);
        fireSeekEvent(snapped);
        commitWhenReady(snapped);
      },
      play: () => {
        const current = store.get(playheadAtom);
        const ls = store.get(loopStartAtom);
        const le = store.get(loopEndAtom);
        if (current < ls || current >= le) {
          store.set(playheadAtom, ls);
          fireSeekEvent(ls, true);
        }
        store.set(isPlayingAtom, true);
      },
      pause: () => {
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
        fireSeekEvent(next, true);
        commitWhenReady(next);
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
        fireSeekEvent(next, true);
        commitWhenReady(next);
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
        store.set(speedAtom, speed);
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
    doCommit,
    commitWhenReady,
    recomputeDuration,
    recomputeStepInterval,
  ]);

  const contextValue = useMemo<PlaybackContextValue>(
    () => ({ duration, stepInterval, ...actions }),
    [duration, stepInterval, actions],
  );

  return { store, contextValue };
}
