/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Turns depth gestures over a stack into whole steps. Option/Alt + wheel
 * and trackpad pinch (a `wheel` with `ctrlKey` on macOS) move through
 * depth; a plain wheel is not a depth gesture and keeps scrolling.
 */

export type WheelLike = Pick<
  WheelEvent,
  "altKey" | "ctrlKey" | "deltaMode" | "deltaX" | "deltaY"
>;

export type DepthGesture = "wheel" | "pinch";

export const depthGesture = (event: WheelLike): DepthGesture | null =>
  event.ctrlKey ? "pinch" : event.altKey ? "wheel" : null;

const LINE = 1;
const PAGE = 2;
/** Browsers report one mouse-wheel notch as three lines. */
const LINES_PER_NOTCH = 3;
/** A pixel delta at least this large is a mouse notch, not a smooth scroll. */
export const NOTCH_MIN = 50;
const NOTCH = 100;

export interface WheelStepOptions {
  /** Smooth-scroll pixels per step. */
  wheelStep?: number;
  /** Pinch delta per step. */
  pinchStep?: number;
  /** Milliseconds without input that end a gesture and drop its remainder. */
  idle?: number;
}

const dominant = (event: WheelLike) =>
  Math.abs(event.deltaY) >= Math.abs(event.deltaX)
    ? event.deltaY
    : event.deltaX;

const notches = (delta: number, size: number) =>
  Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / size));

/**
 * @returns `push`, which gives the signed steps an event moves (positive is
 *   deeper, so wheel down or pinch out), `0` for a depth gesture that has
 *   not reached a step yet, or `null` for a wheel that is not a depth gesture.
 */
export const createWheelSteps = ({
  wheelStep = 40,
  pinchStep = 12,
  idle = 200,
}: WheelStepOptions = {}) => {
  let remainder = 0;
  let last = -Infinity;
  let kind: DepthGesture | null = null;

  const accumulate = (delta: number, unit: number) => {
    // a reversal starts over so the first step back is not swallowed
    if (Math.sign(delta) !== Math.sign(remainder)) remainder = 0;
    remainder += delta;
    const steps = Math.trunc(remainder / unit);
    remainder -= steps * unit;
    return steps;
  };

  return {
    push(event: WheelLike, now: number): number | null {
      const gesture = depthGesture(event);
      if (!gesture) return null;
      if (now - last > idle || gesture !== kind) remainder = 0;
      last = now;
      kind = gesture;

      const delta = dominant(event);
      if (!delta) return 0;
      // spreading the fingers reports negative deltas
      if (gesture === "pinch") return accumulate(-delta, pinchStep);
      if (event.deltaMode === PAGE)
        return Math.sign(delta) * Math.ceil(Math.abs(delta));
      if (event.deltaMode === LINE) return notches(delta, LINES_PER_NOTCH);
      if (Math.abs(delta) >= NOTCH_MIN) {
        remainder = 0;
        return notches(delta, NOTCH);
      }
      return accumulate(delta, wheelStep);
    },
    reset() {
      remainder = 0;
      kind = null;
      last = -Infinity;
    },
  };
};

export type WheelSteps = ReturnType<typeof createWheelSteps>;

/** Keys that step a focused stack: ArrowDown and ] go deeper. */
export const keyStep = (key: string) =>
  key === "ArrowDown" || key === "]"
    ? 1
    : key === "ArrowUp" || key === "["
      ? -1
      : 0;
