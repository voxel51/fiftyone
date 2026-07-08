import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

/** Axis whose movement is reported to {@link UsePointerLockDragOptions.onDelta}. */
export type PointerLockDragAxis = "horizontal" | "vertical";

export interface UsePointerLockDragOptions {
  /** Axis whose movement is reported to `onDelta`. */
  axis: PointerLockDragAxis;
  /**
   * Total travel (px) below which a press-and-release counts as a click rather
   * than a drag — `onClick` fires and `onDelta` never does. Defaults to 3.
   */
  clickThreshold?: number;
  /** Fired once when a drag begins (the first move past `clickThreshold`). */
  onDragStart?: () => void;
  /**
   * Fired on every move once dragging, with the cumulative signed movement
   * along `axis` since the drag began (positive = right / down). Because it is
   * fed by Pointer Lock movement deltas, this value is unbounded — it keeps
   * growing past the edge of the screen.
   */
  onDelta: (delta: number) => void;
  /** Fired once when a press is released without ever crossing the threshold. */
  onClick?: () => void;
  /** Fired once when a real drag ends (pointer released after dragging). */
  onDragEnd?: () => void;
}

export interface UsePointerLockDragReturn {
  /** True between a drag actually starting and the pointer being released. */
  isDragging: boolean;
  /** Spread onto the element that should start a drag on pointer-down. */
  handleProps: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  };
}

/**
 * Track a value-scrubbing drag driven by *relative* mouse motion.
 *
 * Unlike `useDragDelta` — which measures the pointer's absolute position
 * (`clientX/clientY`) and therefore stops reporting once the cursor reaches a
 * screen edge — this hook reads the Pointer Lock API's `movementX/movementY`
 * deltas. It hides the cursor when a drag begins and accumulates raw motion, so
 * the reported delta is unbounded: the drag never runs out of runway even when
 * the element sits at the very bottom of the screen. It also distinguishes a
 * click from a drag and owns the pointer-lock lifecycle.
 *
 * Use `useDragDelta` to drag something to a position on screen; use this to
 * adjust a value by how far the mouse moves.
 *
 * The returned `onPointerDown` calls `preventDefault()` so the press doesn't
 * focus / select the underlying element mid-drag; the caller decides on release
 * (via `onClick`) whether to focus it. Window listeners and any held pointer
 * lock are always torn down on release and on unmount.
 */
export function usePointerLockDrag({
  axis,
  clickThreshold = 3,
  onDragStart,
  onDelta,
  onClick,
  onDragEnd,
}: UsePointerLockDragOptions): UsePointerLockDragReturn {
  const [isDragging, setIsDragging] = useState(false);

  // Route callbacks through a ref so `onPointerDown` stays referentially stable
  // yet always invokes the latest closures.
  const cbRef = useRef({ onDragStart, onDelta, onClick, onDragEnd });
  cbRef.current = { onDragStart, onDelta, onClick, onDragEnd };

  // Teardown for an in-flight drag, invoked on release and on unmount so an
  // interrupted drag never leaks window listeners or a held pointer lock.
  const teardownRef = useRef<(() => void) | null>(null);
  useEffect(() => () => teardownRef.current?.(), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // Suppress the focus / text-selection a pointer-down would trigger; we
      // own the interaction until release.
      e.preventDefault();

      const target = e.currentTarget;
      let accum = 0; // signed movement along `axis` since start
      let moved = 0; // total travel, for the click-vs-drag decision
      let dragging = false;
      let locked = false;

      const onMove = (ev: PointerEvent) => {
        const d = (axis === "vertical" ? ev.movementY : ev.movementX) || 0;
        accum += d;
        moved += Math.abs(d);
        if (moved < clickThreshold) return;
        if (!dragging) {
          dragging = true;
          setIsDragging(true);
          // Engage Pointer Lock only once it's a real drag, so a plain click
          // never hides the cursor. Best-effort: unlocked movement deltas
          // still work until the cursor reaches a screen edge.
          try {
            target.requestPointerLock?.();
          } catch {
            /* Pointer Lock unavailable — keep dragging unlocked. */
          }
          locked = true;
          cbRef.current.onDragStart?.();
        }
        cbRef.current.onDelta(accum);
      };

      const teardown = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (locked) document.exitPointerLock?.();
        teardownRef.current = null;
      };

      const onUp = () => {
        const wasDragging = dragging;
        teardown();
        if (wasDragging) {
          setIsDragging(false);
          cbRef.current.onDragEnd?.();
        } else {
          cbRef.current.onClick?.();
        }
      };

      teardownRef.current = teardown;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [axis, clickThreshold],
  );

  return { isDragging, handleProps: { onPointerDown } };
}
