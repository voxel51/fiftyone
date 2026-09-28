/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Drag-to-resize for one lane's bottom edge. A drag or arrow keys only move a
 * guide line; the new height is committed on release (or Enter), so nothing
 * re-lays out mid-drag.
 */

import styles from "./laneResize.module.css";

import { clampLaneHeight, LANE_HEIGHT_STEP } from "./laneHeights";

export interface LaneResizeOptions {
  /** The lane's current height in pixels. */
  height: () => number;
  /** The client y of the lane's bottom edge. */
  edge: () => number;
  /** A positioned element to draw the guide line in. */
  guideHost: () => HTMLElement | null;
  commit: (height: number) => void;
  reset: () => void;
}

/** @returns a cleanup that removes the listeners and any guide. */
export const attachLaneResize = (
  handle: HTMLElement,
  options: LaneResizeOptions,
) => {
  let session: {
    guide: HTMLElement | null;
    next: number;
    offset: number;
    start: number;
    y?: number;
  } | null = null;

  const move = (next: number) => {
    if (!session) return;
    session.next = clampLaneHeight(next);
    if (session.guide) {
      session.guide.style.top = `${session.offset + session.next - session.start}px`;
    }
  };

  const begin = (y?: number) => {
    const host = options.guideHost();
    const start = options.height();
    let guide: HTMLElement | null = null;
    let offset = 0;
    if (host) {
      guide = document.createElement("div");
      guide.className = styles.guide;
      offset =
        options.edge() - host.getBoundingClientRect().top + host.scrollTop;
      host.appendChild(guide);
    }
    session = { guide, next: start, offset, start, y };
    move(start);
  };

  const end = (commit: boolean) => {
    if (!session) return;
    const { guide, next, start } = session;
    session = null;
    guide?.remove();
    commit && next !== start && options.commit(next);
  };

  const listeners: [string, (event: never) => void][] = [
    [
      "pointerdown",
      (event: PointerEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture?.(event.pointerId);
        begin(event.clientY);
      },
    ],
    [
      "pointermove",
      (event: PointerEvent) => {
        if (session?.y === undefined) return;
        move(session.start + event.clientY - session.y);
      },
    ],
    ["pointerup", () => session?.y !== undefined && end(true)],
    ["pointercancel", () => end(false)],
    ["blur", () => end(false)],
    // a handle inside a tile must not select or open that tile's sample
    ["click", (event: Event) => event.stopPropagation()],
    [
      "dblclick",
      (event: Event) => {
        event.stopPropagation();
        end(false);
        options.reset();
      },
    ],
    [
      "keydown",
      (event: KeyboardEvent) => {
        const step =
          event.key === "ArrowUp"
            ? -LANE_HEIGHT_STEP
            : event.key === "ArrowDown"
              ? LANE_HEIGHT_STEP
              : 0;
        if (step) {
          session ?? begin();
          move(session!.next + step);
        } else if (event.key === "Enter" && session) {
          end(true);
        } else if (event.key === "Escape" && session) {
          end(false);
        } else return;
        event.preventDefault();
        event.stopPropagation();
      },
    ],
  ];

  for (const [type, listener] of listeners) {
    handle.addEventListener(type, listener as EventListener);
  }
  return () => {
    end(false);
    for (const [type, listener] of listeners) {
      handle.removeEventListener(type, listener as EventListener);
    }
  };
};

/** Makes `element` a focusable resize handle for a lane of `height` pixels. */
export const decorateHandle = (
  element: HTMLElement,
  height: number,
  className?: string,
) => {
  element.className = className
    ? `${styles.handle} ${className}`
    : styles.handle;
  element.tabIndex = 0;
  element.setAttribute("role", "separator");
  element.setAttribute("aria-orientation", "horizontal");
  element.setAttribute("aria-label", "Resize lane");
  element.setAttribute("aria-valuenow", String(Math.round(height)));
  element.title = "Drag to resize, double-click to reset";
};
