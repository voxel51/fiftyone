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
  PlaybackConfig,
  PlaybackContextValue,
  PlaybackStore,
  PlaybackStream,
} from "./types";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function usePlaybackEngine({
  duration = 0,
  stepInterval,
  defaultLoopStart,
  defaultLoopEnd,
  defaultSpeed = 1.0,
}: PlaybackConfig): { store: PlaybackStore; contextValue: PlaybackContextValue } {
  // The duration prop is a FALLBACK when no stream provides one. Stored in a
  // ref so the recompute function can read the latest value without
  // capturing it.
  const fallbackDurationRef = useRef(duration);
  fallbackDurationRef.current = duration;

  const store = useMemo(() => {
    const s = createStore();
    s.set(durationAtom, duration);
    s.set(stepIntervalAtom, stepInterval);
    s.set(speedAtom, defaultSpeed);
    s.set(viewEndAtom, duration);
    s.set(loopStartAtom, defaultLoopStart ?? 0);
    s.set(loopEndAtom, defaultLoopEnd ?? duration);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // store is created once at mount; config is treated as mount-time

  const streamsRef = useRef<Map<string, PlaybackStream>>(new Map());
  const subscribersRef = useRef<Map<string, number>>(new Map());
  const rafIdRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
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

  const fireSeekEvent = useCallback(
    (time: number, immediate = false) => {
      const fire = () => {
        seekSeqRef.current += 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        store.set(seekEventAtom as any, { time, seq: seekSeqRef.current });
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

  const tick = useCallback(
    (timestamp: number) => {
      // Capture first timestamp to avoid a large dt spike on the first frame.
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const dt = ((timestamp - lastTimestampRef.current) / 1000) * store.get(speedAtom);
      lastTimestampRef.current = timestamp;

      const currentTime = store.get(playheadAtom);
      const loopStart = store.get(loopStartAtom);
      const loopEnd = store.get(loopEndAtom);

      const rawNext = currentTime + dt;
      const willWrap = rawNext >= loopEnd;
      const targetTime = willWrap ? loopStart : rawNext;

      const duration = store.get(durationAtom);
      let isBuffering = false;

      for (const s of streamsRef.current.values()) {
        if (!s.blocking) continue;
        if (!isActive(s.id)) continue; // dormant — no subscribers
        const state = s.bufferState(targetTime);
        if (state === "ready") continue;
        isBuffering = true;
        // "loading" means fetch already in flight — don't re-request.
        if (state === "missing") {
          s.prefetch?.([targetTime, Math.min(duration, targetTime + (s.lookaheadSeconds ?? 3))]);
        }
      }

      store.set(isBufferingAtom, isBuffering);

      if (!isBuffering) {
        store.set(playheadAtom, targetTime);
        doCommit(targetTime);
        // Loop-wrap is a discontinuous jump — fire immediately so streams
        // can flush their cache and buffer around loopStart.
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
        store.set(viewStartAtom, start);
        store.set(viewEndAtom, end);
      },
      setLoop: (start: number, end: number) => {
        store.set(loopStartAtom, start);
        store.set(loopEndAtom, end);
      },
      setSpeed: (speed: number) => {
        store.set(speedAtom, speed);
      },
      registerStream: (stream: PlaybackStream) => {
        streamsRef.current.set(stream.id, stream);
        recomputeDuration();
        return () => {
          streamsRef.current.delete(stream.id);
          recomputeDuration();
        };
      },
      subscribeStream: (id: string) => {
        subscribersRef.current.set(id, (subscribersRef.current.get(id) ?? 0) + 1);
        return () => {
          const next = (subscribersRef.current.get(id) ?? 1) - 1;
          if (next <= 0) {
            subscribersRef.current.delete(id);
          } else {
            subscribersRef.current.set(id, next);
          }
        };
      },
    }),
    [store, fireSeekEvent, doCommit, checkAllReady, recomputeDuration]
  );

  const contextValue = useMemo<PlaybackContextValue>(
    () => ({ duration, stepInterval, ...actions }),
    [duration, stepInterval, actions]
  );

  return { store, contextValue };
}
