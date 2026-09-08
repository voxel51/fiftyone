/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Copied verbatim from @voxel51/voodo `src/util/useDraggable.ts`, which
 * the library uses for Toolbar but does not (yet) export from its root.
 * Delete this copy and import from the package once VOODO exports it.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

const clamp = (
  lock: boolean,
  pos: number,
  delta: number,
  max: number,
): number => (lock ? pos : Math.max(0, Math.min(max, pos + delta)));

export interface UseDraggableOptions {
  /** Initial offset from the left edge of the bounding container. Accepts any CSS length (e.g. `0`, `"10%"`, `"2rem"`). Default `0`. */
  initialX?: string | number;
  /** Initial offset from the top edge of the bounding container. Accepts any CSS length (e.g. `0`, `"10%"`, `"2rem"`). Default `0`. */
  initialY?: string | number;
  /** Lock horizontal (x-axis) movement. Default `false`. */
  lockX?: boolean;
  /** Lock vertical (y-axis) movement. Default `false`. */
  lockY?: boolean;
  /**
   * When `true`, bounds are computed against the viewport (`window.innerWidth` /
   * `window.innerHeight`) instead of the element's parent. Use together with
   * `position: fixed`. Default `false`.
   */
  portal?: boolean;
  /**
   * Called after every drag move with the new pixel position.
   * Always delivers pixel values regardless of what type `initialX`/`initialY` were.
   */
  onPositionChange?: (pos: { x: number; y: number }) => void;
}

export interface UseDraggableReturn {
  /** Current `{ x, y }` position. Before the first drag this reflects the initial CSS value; after the first drag it is always a pixel number. */
  position: { x: string | number; y: string | number };
  /** `true` while the user is actively dragging. */
  isDragging: boolean;
  /** Attach to the element that should be repositioned. */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * `onMouseDown` handler for the drag-handle element.
   * Only has an effect when both `lockX` and `lockY` are not both `true`.
   */
  handleDragStart: (e: React.MouseEvent) => void;
}

/**
 * Hook that provides drag-to-reposition behaviour for a floating element.
 *
 * The hook tracks mouse interactions and keeps the element within the bounds of
 * either its nearest parent element or the viewport (when `portal` is `true`).
 *
 * @example
 * ```tsx
 * const { position, isDragging, containerRef, handleDragStart } = useDraggable({
 *   initialX: 20,
 *   initialY: 100,
 * });
 *
 * return (
 *   <div
 *     ref={containerRef}
 *     data-dragging={isDragging || undefined}
 *     style={{ position: "absolute", left: position.x, top: position.y }}
 *   >
 *     <button onMouseDown={handleDragStart}>drag me</button>
 *   </div>
 * );
 * ```
 */
export const useDraggable = ({
  initialX = 0,
  initialY = 0,
  lockX = false,
  lockY = false,
  portal = false,
  onPositionChange,
}: UseDraggableOptions = {}): UseDraggableReturn => {
  const canDrag = !(lockX && lockY);

  const [position, setPosition] = useState<{
    x: string | number;
    y: string | number;
  }>({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLElement | null>(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    pos: { x: number; y: number };
  }>({
    clientX: 0,
    clientY: 0,
    pos: { x: 0, y: 0 },
  });
  // Mutable mirror of position so handleDragStart can read the current numeric
  // position without being listed as a useCallback dependency.
  const positionRef = useRef<{ x: string | number; y: string | number }>({
    x: initialX,
    y: initialY,
  });

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!canDrag) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      const el = containerRef.current;
      const cur = positionRef.current;
      // For numeric positions use the tracked value (avoids jsdom offsetLeft=0).
      // For CSS string positions (e.g. "4rem", "22%") read offsetLeft/offsetTop
      // so the browser-resolved pixel value is used as the drag origin.
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        pos: {
          x: typeof cur.x === "number" ? cur.x : (el?.offsetLeft ?? 0),
          y: typeof cur.y === "number" ? cur.y : (el?.offsetTop ?? 0),
        },
      };
    },
    [canDrag],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const el = containerRef.current;
      const fallback = {
        clientWidth: window.innerWidth,
        clientHeight: window.innerHeight,
      };
      const parent = portal ? fallback : (el?.parentElement ?? fallback);

      const toolbarW = el?.offsetWidth ?? 0;
      const toolbarH = el?.offsetHeight ?? 0;
      const { clientX, clientY, pos } = dragStartRef.current;

      const nextX = clamp(
        lockX,
        pos.x,
        e.clientX - clientX,
        parent.clientWidth - toolbarW,
      );
      const nextY = clamp(
        lockY,
        pos.y,
        e.clientY - clientY,
        parent.clientHeight - toolbarH,
      );

      positionRef.current = { x: nextX, y: nextY };
      setPosition({ x: nextX, y: nextY });
      onPositionChange?.({ x: nextX, y: nextY });
    },
    [lockX, lockY, portal, onPositionChange],
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseUp = (): void => setIsDragging(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove]);

  return { position, isDragging, containerRef, handleDragStart };
};
