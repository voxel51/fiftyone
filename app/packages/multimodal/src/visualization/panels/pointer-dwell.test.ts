import { afterEach, describe, expect, it, vi } from "vitest";

import { attachPointerDwell } from "./pointer-dwell";

const DWELL_MS = 150;
const TOLERANCE_PX = 4;

function setup() {
  const element = document.createElement("div");
  const onDwell = vi.fn();
  const onCancel = vi.fn();
  const detach = attachPointerDwell(element, {
    dwellMs: DWELL_MS,
    moveTolerancePx: TOLERANCE_PX,
    onCancel,
    onDwell,
  });
  return { detach, element, onCancel, onDwell };
}

function pointerMove(
  element: HTMLElement,
  clientX: number,
  clientY: number,
  buttons = 0,
) {
  element.dispatchEvent(
    new MouseEvent("pointermove", { buttons, clientX, clientY }),
  );
}

describe("attachPointerDwell", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once at the rested position after the dwell delay", () => {
    vi.useFakeTimers();
    const { element, onCancel, onDwell } = setup();

    pointerMove(element, 40, 60);
    vi.advanceTimersByTime(DWELL_MS - 1);
    expect(onDwell).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDwell).toHaveBeenCalledExactlyOnceWith(40, 60);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("re-arms while the pointer keeps moving", () => {
    vi.useFakeTimers();
    const { element, onDwell } = setup();

    pointerMove(element, 10, 10);
    vi.advanceTimersByTime(DWELL_MS - 10);
    pointerMove(element, 60, 60);
    vi.advanceTimersByTime(DWELL_MS - 10);
    expect(onDwell).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10);
    expect(onDwell).toHaveBeenCalledExactlyOnceWith(60, 60);
  });

  it("tolerates micro-jitter after firing but cancels real movement", () => {
    vi.useFakeTimers();
    const { element, onCancel, onDwell } = setup();

    pointerMove(element, 100, 100);
    vi.advanceTimersByTime(DWELL_MS);
    expect(onDwell).toHaveBeenCalledTimes(1);

    // Within tolerance: no cancel; the timer re-arms and re-fires there.
    pointerMove(element, 102, 101);
    expect(onCancel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DWELL_MS);
    expect(onDwell).toHaveBeenCalledTimes(2);

    // Beyond tolerance: the fired dwell cancels.
    pointerMove(element, 140, 140);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("suppresses dwell during drags and cancels a shown result", () => {
    vi.useFakeTimers();
    const { element, onCancel, onDwell } = setup();

    pointerMove(element, 10, 10);
    vi.advanceTimersByTime(DWELL_MS);
    expect(onDwell).toHaveBeenCalledTimes(1);

    pointerMove(element, 12, 12, 1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DWELL_MS * 2);
    expect(onDwell).toHaveBeenCalledTimes(1);
  });

  it("cancels on pointerdown, pointerleave, and wheel", () => {
    vi.useFakeTimers();
    const { element, onCancel, onDwell } = setup();

    for (const [index, type] of [
      "pointerdown",
      "pointerleave",
      "wheel",
    ].entries()) {
      pointerMove(element, 10, 10);
      vi.advanceTimersByTime(DWELL_MS);
      expect(onDwell).toHaveBeenCalledTimes(index + 1);
      element.dispatchEvent(new Event(type));
      expect(onCancel).toHaveBeenCalledTimes(index + 1);
    }
  });

  it("never fires a pending dwell after an interrupt", () => {
    vi.useFakeTimers();
    const { element, onDwell } = setup();

    pointerMove(element, 10, 10);
    element.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(DWELL_MS * 2);
    expect(onDwell).not.toHaveBeenCalled();
  });

  it("detach unbinds listeners and cancels a fired dwell", () => {
    vi.useFakeTimers();
    const { detach, element, onCancel, onDwell } = setup();

    pointerMove(element, 10, 10);
    vi.advanceTimersByTime(DWELL_MS);
    detach();
    expect(onCancel).toHaveBeenCalledTimes(1);

    pointerMove(element, 50, 50);
    vi.advanceTimersByTime(DWELL_MS * 2);
    expect(onDwell).toHaveBeenCalledTimes(1);
  });
});
