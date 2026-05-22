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
import type {
  PlaybackClockSource,
  PlaybackConfig,
  PlaybackContextValue,
  PlaybackStore,
  PlaybackStream,
} from "./types";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

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

  const store = useMemo(() => {
    const s = createStore();
    const initialDuration = Math.max(0, duration);
    const loopStart = clamp(defaultLoopStart ?? 0, 0, initialDuration);
    const rawLoopEnd = clamp(
      defaultLoopEnd ?? initialDuration,
      0,
      initialDuration
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
        seekDebounceRef.current = setTimeout(fire, 50);
      }
    },
    [store]
  );

  const doCommit = useCallback(
    (time: number) => {
      store.set(currentTimeAtom, time);
      for (const s of streamsRef.current.values()) {
        if (!isActive(s.id)) continue;
        s.onCommit?.(time, store);
      }
    },
    [store, isActive]
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
      const duration = store.get(durationAtom);

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

      // Barrier: every blocking, subscribed stream must be ready at
      // `targetTime` before we commit. Streams that report `missing`
      // get a prefetch nudge; `loading` is already in flight.
      let isBuffering = false;
      for (const s of streamsRef.current.values()) {
        if (!s.blocking) continue;
        if (!isActive(s.id)) continue;
        const state = s.bufferState(targetTime);
        if (state === "ready") continue;
        isBuffering = true;
        if (state === "missing") {
          s.prefetch?.([
            targetTime,
            Math.min(duration, targetTime + (s.lookaheadSeconds ?? 3)),
          ]);
        }
      }

      store.set(isBufferingAtom, isBuffering);

      if (!isBuffering) {
        store.set(playheadAtom, targetTime);
        doCommit(targetTime);
        // Loop-wrap is a discontinuous jump — fire immediately so
        // streams can flush their cache and buffer around loopStart.
        if (willWrap) fireSeekEvent(loopStart, true);
      }

      rafIdRef.current = requestAnimationFrame(tick);
    },
    [store, fireSeekEvent, doCommit, isActive]
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
      // A queued seek-event timeout could otherwise fire after unmount and
      // touch an orphaned store.
      if (seekDebounceRef.current !== null) {
        clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = null;
      }
    };
  }, [store, tick]);

  const checkAllReady = useCallback(
    (time: number): boolean => {
      for (const s of streamsRef.current.values()) {
        if (!s.blocking) continue;
        if (!isActive(s.id)) continue; // dormant — no subscribers
        if (s.bufferState(time) !== "ready") return false;
      }
      return true;
    },
    [isActive]
  );

  const actions = useMemo(
    () => ({
      seek: (time: number) => {
        const clamped = clamp(time, 0, store.get(durationAtom));
        store.set(playheadAtom, clamped);
        fireSeekEvent(clamped);
        if (checkAllReady(clamped)) doCommit(clamped);
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
      },
      stepBack: () => {
        const next = clamp(
          store.get(playheadAtom) - store.get(stepIntervalAtom),
          0,
          store.get(durationAtom)
        );
        store.set(playheadAtom, next);
        fireSeekEvent(next, true);
        if (checkAllReady(next)) doCommit(next);
      },
      stepForward: () => {
        const next = clamp(
          store.get(playheadAtom) + store.get(stepIntervalAtom),
          0,
          store.get(durationAtom)
        );
        store.set(playheadAtom, next);
        fireSeekEvent(next, true);
        if (checkAllReady(next)) doCommit(next);
      },
      setView: (start: number, end: number) => {
        // Apply the same validation as setLoop so the visible window
        // can't end up inverted, collapsed, or outside [0, duration].
        const dur = store.get(durationAtom);
        const vs = clamp(start, 0, dur);
        const ve = clamp(end, 0, dur);
        if (ve <= vs) return;
        store.set(viewStartAtom, vs);
        store.set(viewEndAtom, ve);
      },
      setLoop: (start: number, end: number) => {
        const dur = store.get(durationAtom);
        const ls = clamp(start, 0, dur);
        const le = clamp(end, 0, dur);
        // Reject inverted / collapsed windows so the RAF wrap path can't
        // get trapped in a zero-width loop.
        if (le <= ls) return;
        store.set(loopStartAtom, ls);
        store.set(loopEndAtom, le);
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
          (subscribersRef.current.get(id) ?? 0) + 1
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
    }),
    [
      store,
      fireSeekEvent,
      doCommit,
      checkAllReady,
      recomputeDuration,
      recomputeStepInterval,
    ]
  );

  const contextValue = useMemo<PlaybackContextValue>(
    () => ({ duration, stepInterval, ...actions }),
    [duration, stepInterval, actions]
  );

  return { store, contextValue };
}
