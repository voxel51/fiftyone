import { ThreeEvent } from "@react-three/fiber";
import * as React from "react";

type ClickEvt = ThreeEvent<MouseEvent>;
type PointerEvt = ThreeEvent<PointerEvent>;

export type DragGate3DProps = {
  /** Screen-space threshold in px before we treat it as a drag */
  dragThresholdPx?: number;
  /** Fires only if it was a click (not a drag) */
  onClick?: (e: ClickEvt) => void;
  /** Single R3F element */
  children: React.ReactElement;
};

/**
 * Wraps a 3D element to distinguish clicks from drags.
 * Only fires onClick if the pointer didn't move beyond the threshold.
 */
export function DragGate3D({
  dragThresholdPx = 6,
  onClick,
  children,
}: DragGate3DProps) {
  const startRef = React.useRef<{ x: number; y: number } | null>(null);
  const draggedRef = React.useRef(false);

  const thresholdSq = dragThresholdPx * dragThresholdPx;

  const handlePointerDown = React.useCallback((e: PointerEvt) => {
    startRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    draggedRef.current = false;
  }, []);

  const handlePointerMove = React.useCallback(
    (e: PointerEvt) => {
      if (!startRef.current || draggedRef.current) return;

      const dx = e.nativeEvent.clientX - startRef.current.x;
      const dy = e.nativeEvent.clientY - startRef.current.y;

      if (dx * dx + dy * dy > thresholdSq) {
        draggedRef.current = true;
      }
    },
    [thresholdSq]
  );

  const handlePointerUp = React.useCallback(() => {
    startRef.current = null;
  }, []);

  const handleClick = React.useCallback(
    (e: ClickEvt) => {
      if (draggedRef.current) {
        e.stopPropagation();
        return;
      }
      onClick?.(e);
    },
    [onClick]
  );

  return React.cloneElement(children, {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onClick: handleClick,
  });
}
