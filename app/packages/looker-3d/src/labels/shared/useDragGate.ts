import { ThreeEvent } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import { DRAG_GATE_THRESHOLD_PX } from "../../constants";

type PointerEvt = ThreeEvent<PointerEvent>;

export interface UseDragGateOptions {
  /** Screen-space threshold in px before we treat it as a drag */
  dragThresholdPx?: number;
}

export interface UseDragGateResult {
  onPointerDown: (e: PointerEvt) => void;
  onPointerMove: (e: PointerEvt) => void;
  onPointerUp: (e: PointerEvt) => void;
  /** Call from your click handler; false means the pointer dragged past the threshold since the last pointer-down. */
  isClick: () => boolean;
}

/**
 * Drag-vs-click state machine shared by the standalone (`DragGate3D`) and
 * instanced-batch picking paths. Tracks pointer-down origin and flags a drag
 * once movement exceeds `dragThresholdPx`, so callers can suppress a click
 * that follows a drag.
 */
export function useDragGate({
  dragThresholdPx = DRAG_GATE_THRESHOLD_PX,
}: UseDragGateOptions = {}): UseDragGateResult {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const thresholdSq = dragThresholdPx * dragThresholdPx;

  const onPointerDown = useCallback((e: PointerEvt) => {
    startRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    draggedRef.current = false;
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvt) => {
      if (!startRef.current || draggedRef.current) return;

      const dx = e.nativeEvent.clientX - startRef.current.x;
      const dy = e.nativeEvent.clientY - startRef.current.y;

      if (dx * dx + dy * dy > thresholdSq) {
        draggedRef.current = true;
      }
    },
    [thresholdSq],
  );

  const onPointerUp = useCallback((_e: PointerEvt) => {
    startRef.current = null;
  }, []);

  const isClick = useCallback(() => !draggedRef.current, []);

  return { onPointerDown, onPointerMove, onPointerUp, isClick };
}
