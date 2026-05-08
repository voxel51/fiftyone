import {
  drawRippleRings,
  type KeypointEffect,
  KeypointOverlay,
} from "@fiftyone/lighter";
import { useCallback, useEffect, useRef } from "react";

const RIPPLE_EFFECT_ID = "keypoint-ripple";

type OverlayRippleState = {
  overlay: KeypointOverlay;
  startTime: number;
  // pointId -> performance.now() expiry. Number.POSITIVE_INFINITY means
  // ripple indefinitely until explicitly removed.
  deadlines: Map<string, number>;
};

export interface UseKeypointRippleEffectAPI {
  /**
   * Starts a ripple on `pointId` of the keypoint overlay identified by
   * `overlayId`. If `durationMs` is provided, the ripple auto-clears once
   * that many milliseconds have elapsed; calling again refreshes the
   * deadline. Omit `durationMs` to ripple until explicitly removed.
   *
   * No-op if the overlay isn't a `KeypointOverlay`.
   */
  add: (overlayId: string, pointId: string, durationMs?: number) => void;
  /** Stops the ripple on `pointId` of the given overlay, if active. */
  remove: (overlayId: string, pointId: string) => void;
}

/**
 * React-side owner of keypoint ripple animations. Drives a single rAF loop
 * across every overlay with active ripples, registers a draw effect on each
 * overlay only while it has work to do, and cleans up on unmount.
 *
 * Keeps the overlay class itself ignorant of ripple state — it just exposes
 * a generic effect registry, and this hook plugs the ripple effect into it.
 */
export const useKeypointRippleEffect = (
  getOverlay: (id: string) => unknown
): UseKeypointRippleEffectAPI => {
  const statesRef = useRef<Map<string, OverlayRippleState>>(new Map());
  const rafRef = useRef<number | null>(null);

  // The tick captured below references `statesRef.current` directly, so
  // it always sees the latest map without re-binding.
  const tick = useCallback(() => {
    rafRef.current = null;
    const states = statesRef.current;
    const now = performance.now();

    for (const [overlayId, state] of states) {
      // Expire deadlines elapsed since the last frame.
      for (const [pointId, deadline] of state.deadlines) {
        if (now >= deadline) state.deadlines.delete(pointId);
      }
      // Always mark dirty so the frame where the last ripple expires gets
      // a final repaint that erases its trailing ring.
      state.overlay.markDirty();
      if (state.deadlines.size === 0) {
        state.overlay.unregisterEffect(RIPPLE_EFFECT_ID);
        states.delete(overlayId);
      }
    }

    if (states.size > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const ensureLoop = useCallback(() => {
    if (rafRef.current === null && statesRef.current.size > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  const add = useCallback(
    (overlayId: string, pointId: string, durationMs?: number) => {
      const overlay = getOverlay(overlayId);
      if (!(overlay instanceof KeypointOverlay)) return;

      let state = statesRef.current.get(overlayId);
      if (!state) {
        const newState: OverlayRippleState = {
          overlay,
          startTime: performance.now(),
          deadlines: new Map(),
        };
        const draw: KeypointEffect = ({
          renderer,
          points,
          resolveStyle,
          containerId,
        }) => {
          const elapsedMs = performance.now() - newState.startTime;
          for (const p of points) {
            if (!newState.deadlines.has(p.id)) continue;
            const style = resolveStyle(p.variant);
            drawRippleRings({
              renderer,
              center: p.position,
              color: style.fillStyle || style.strokeStyle || "#ffffff",
              elapsedMs,
              containerId,
            });
          }
        };
        overlay.registerEffect(RIPPLE_EFFECT_ID, draw);
        statesRef.current.set(overlayId, newState);
        state = newState;
      }

      state.deadlines.set(
        pointId,
        durationMs == null
          ? Number.POSITIVE_INFINITY
          : performance.now() + durationMs
      );
      overlay.markDirty();
      ensureLoop();
    },
    [getOverlay, ensureLoop]
  );

  const remove = useCallback((overlayId: string, pointId: string) => {
    const state = statesRef.current.get(overlayId);
    if (!state) return;
    if (state.deadlines.delete(pointId)) state.overlay.markDirty();
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      for (const state of statesRef.current.values()) {
        state.overlay.unregisterEffect(RIPPLE_EFFECT_ID);
      }
      statesRef.current.clear();
    };
  }, []);

  return { add, remove };
};
