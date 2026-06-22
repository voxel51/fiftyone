import { useCallback, useEffect, useRef, useState } from "react";

// frames of near-zero movement before the rAF loop stops (and declares settled)
const IDLE_FRAMES = 4;
const IDLE_EPSILON = 0.5; // px/frame treated as "not moving"
// `moving` stays true this long after the last above-threshold frame, so a flick
// with frame gaps never momentarily reads as settled and triggers a mid-scroll load
const SETTLE_DELAY_MS = 140;
// EMA factor for velocity — smooths per-frame spikes from discrete wheel notches
const VELOCITY_SMOOTHING = 0.7;

export interface VirtualScroll {
  /** current synthetic scroll offset (px). */
  vTop: number;
  /** true while scrolling faster than the settle threshold (gates loading). */
  moving: boolean;
  /** true while scrolling faster than the (higher) accelerated threshold (a flick). */
  fast: boolean;
  /** max scroll offset (virtualHeight - viewportHeight, >= 0). */
  max: number;
  scrollTo: (v: number) => void;
  scrollBy: (dy: number) => void;
}

/**
 * Synthetic (virtual) vertical scroll for the infinite grid: no native scrollbar
 * / no full-content DOM. Wheel deltas (incl. OS trackpad inertia → flick) and
 * keyboard/thumb input drive `vTop`; a rAF loop tracks velocity and reports
 * `moving` (above `settleSpeed`) so the caller loads only when motion slows.
 */
export default function useVirtualScroll({
  elementRef,
  virtualHeight,
  viewportHeight,
  settleSpeed,
  acceleratedSpeed,
}: {
  elementRef: React.RefObject<HTMLElement>;
  virtualHeight: number;
  viewportHeight: number;
  /** px/sec at or below which scrolling counts as settled (load resumes). */
  settleSpeed: number;
  /** px/sec above which scrolling counts as an accelerated flick (`fast`). */
  acceleratedSpeed: number;
}): VirtualScroll {
  const [vTop, setVTop] = useState(0);
  const [moving, setMoving] = useState(false);
  const [fast, setFast] = useState(false);

  const vTopRef = useRef(0);
  const maxRef = useRef(0);
  maxRef.current = Math.max(0, virtualHeight - viewportHeight);

  const rafRef = useRef<number>();
  const runningRef = useRef(false);
  const lastTimeRef = useRef(0);
  const lastVRef = useRef(0);
  // timestamps of the last frame whose velocity exceeded each threshold.
  const lastFastRef = useRef(0);
  const lastAccelRef = useRef(0);
  // smoothed (EMA) scroll velocity in px/sec.
  const velRef = useRef(0);
  const settleSpeedRef = useRef(settleSpeed);
  settleSpeedRef.current = settleSpeed;
  const acceleratedSpeedRef = useRef(acceleratedSpeed);
  acceleratedSpeedRef.current = acceleratedSpeed;

  const clamp = useCallback(
    (v: number) => Math.min(Math.max(v, 0), maxRef.current),
    []
  );

  const ensureLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTimeRef.current = performance.now();
    lastVRef.current = vTopRef.current;
    let idle = 0;

    const tick = () => {
      const now = performance.now();
      const dt = Math.max(now - lastTimeRef.current, 1) / 1000;
      const delta = vTopRef.current - lastVRef.current;
      const instant = Math.abs(delta) / dt;
      velRef.current =
        velRef.current * VELOCITY_SMOOTHING +
        instant * (1 - VELOCITY_SMOOTHING);
      const velocity = velRef.current;
      lastTimeRef.current = now;
      lastVRef.current = vTopRef.current;

      // both flags use the same hysteresis to bridge frame gaps: `moving` gates
      // loading, `fast` (higher threshold) gates the accelerated-scroll indicator
      const aboveSettle = velocity > settleSpeedRef.current;
      if (aboveSettle) lastFastRef.current = now;
      const isMoving =
        aboveSettle || now - lastFastRef.current < SETTLE_DELAY_MS;

      const aboveAccel = velocity > acceleratedSpeedRef.current;
      if (aboveAccel) lastAccelRef.current = now;
      const isFast = aboveAccel || now - lastAccelRef.current < SETTLE_DELAY_MS;

      setVTop(vTopRef.current);
      setMoving(isMoving);
      setFast(isFast);

      idle = Math.abs(delta) < IDLE_EPSILON ? idle + 1 : 0;
      // stop only once truly settled, so the loop never leaves `moving` stuck true
      if (idle > IDLE_FRAMES && !isMoving) {
        runningRef.current = false;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const scrollBy = useCallback(
    (dy: number) => {
      vTopRef.current = clamp(vTopRef.current + dy);
      ensureLoop();
    },
    [clamp, ensureLoop]
  );

  const scrollTo = useCallback(
    (v: number) => {
      vTopRef.current = clamp(v);
      ensureLoop();
    },
    [clamp, ensureLoop]
  );

  // wheel — preventDefault so the page doesn't also scroll; OS inertia arrives
  // as decaying deltas, giving flick/momentum for free.
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scrollBy(e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [elementRef, scrollBy]);

  // keyboard paging when the grid is focused.
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const page = viewportHeight * 0.9;
      const map: Record<string, number> = {
        PageDown: page,
        PageUp: -page,
        Home: -maxRef.current,
        End: maxRef.current,
        ArrowDown: 80,
        ArrowUp: -80,
      };
      if (e.key in map) {
        e.preventDefault();
        e.key === "Home"
          ? scrollTo(0)
          : e.key === "End"
          ? scrollTo(maxRef.current)
          : scrollBy(map[e.key]);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [elementRef, viewportHeight, scrollBy, scrollTo]);

  // keep vTop within a shrunken extent (resize / zoom change).
  useEffect(() => {
    if (vTopRef.current > maxRef.current) {
      vTopRef.current = maxRef.current;
      setVTop(vTopRef.current);
    }
  }, [virtualHeight, viewportHeight]);

  useEffect(
    () => () => {
      rafRef.current && cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return { vTop, moving, fast, max: maxRef.current, scrollTo, scrollBy };
}
