import { useCallback, useEffect, useRef, useState } from "react";

export interface UseTimelineStateOptions {
  duration: number;
  fps?: number;
  defaultLoopStart?: number;
  defaultLoopEnd?: number;
}

export interface UseTimelineStateResult {
  currentTime: number;
  isPlaying: boolean;
  viewStart: number;
  viewEnd: number;
  loopStart: number;
  loopEnd: number;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  stepBack: () => void;
  stepForward: () => void;
  setView: (start: number, end: number) => void;
  setLoop: (start: number, end: number) => void;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function useTimelineState({
  duration,
  fps = 60,
  defaultLoopStart,
  defaultLoopEnd,
}: UseTimelineStateOptions): UseTimelineStateResult {
  const frame = 1 / fps;

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(duration);
  const [loopStart, setLoopStart] = useState(defaultLoopStart ?? 0);
  const [loopEnd, setLoopEnd] = useState(defaultLoopEnd ?? duration);

  // Ref so the interval callback always sees fresh loop bounds without
  // recreating the interval on every loop change.
  const loopRef = useRef({
    loopStart: defaultLoopStart ?? 0,
    loopEnd: defaultLoopEnd ?? duration,
  });
  useEffect(() => {
    loopRef.current = { loopStart, loopEnd };
  }, [loopStart, loopEnd]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const id = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + frame;
        return next >= loopRef.current.loopEnd
          ? loopRef.current.loopStart
          : next;
      });
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [isPlaying, fps, frame]);

  const play = useCallback(() => {
    setCurrentTime((prev) => {
      const { loopStart: ls, loopEnd: le } = loopRef.current;
      return prev < ls || prev >= le ? ls : prev;
    });
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => setIsPlaying(false), []);

  const seek = useCallback(
    (t: number) => setCurrentTime(clamp(t, 0, duration)),
    [duration]
  );

  const stepBack = useCallback(
    () => setCurrentTime((prev) => clamp(prev - frame, 0, duration)),
    [frame, duration]
  );

  const stepForward = useCallback(
    () => setCurrentTime((prev) => clamp(prev + frame, 0, duration)),
    [frame, duration]
  );

  const setView = useCallback((start: number, end: number) => {
    setViewStart(start);
    setViewEnd(end);
  }, []);

  const setLoop = useCallback((start: number, end: number) => {
    loopRef.current = { loopStart: start, loopEnd: end };
    setLoopStart(start);
    setLoopEnd(end);
  }, []);

  return {
    currentTime,
    isPlaying,
    viewStart,
    viewEnd,
    loopStart,
    loopEnd,
    play,
    pause,
    seek,
    stepBack,
    stepForward,
    setView,
    setLoop,
  };
}
