/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { thumbTop } from "./model";

/** The share of the remaining distance the thumb covers each frame. */
const EASE = 0.3;
const CLOSE = 0.0005;

const percent = (fraction: number) => `${fraction * 100}%`;

/**
 * Moves the thumb outside React. Every source (rows, the scroll between
 * them, jumps) aims it at a position and it eases there frame by frame, so
 * sources that disagree slightly never make it jump back and forth.
 */
export default function useThumbMotion({
  span,
  start,
  thumb,
}: {
  span: number;
  start: "left" | "top";
  thumb: RefObject<HTMLElement>;
}) {
  const shown = useRef<number>();
  const target = useRef(0);
  const frame = useRef(0);
  const layout = useRef({ span, start });
  layout.current = { span, start };

  const paint = useCallback(() => {
    const el = thumb.current;
    if (!el || shown.current === undefined) return;
    el.style[layout.current.start] = percent(
      thumbTop(shown.current, layout.current.span),
    );
  }, [thumb]);

  const step = useCallback(() => {
    frame.current = 0;
    const from = shown.current ?? target.current;
    const next = from + (target.current - from) * EASE;
    shown.current =
      Math.abs(target.current - next) < CLOSE ? target.current : next;
    paint();
    if (shown.current !== target.current) {
      frame.current = requestAnimationFrame(step);
    }
  }, [paint]);

  const aim = useCallback(
    (position: number, immediate = false) => {
      target.current = position;
      if (immediate || shown.current === undefined) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        shown.current = position;
        paint();
        return;
      }
      if (!frame.current) frame.current = requestAnimationFrame(step);
    },
    [paint, step],
  );

  useLayoutEffect(paint, [paint, span, start]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return aim;
}
