// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOVER_DEBOUNCE_MS } from "../constants";
import type { HoverHit } from "../types";
import { HoverPicker } from "./HoverPicker";

const fire = (
  target: HTMLElement,
  type: string,
  props: Record<string, unknown> = {},
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    button: 0,
    buttons: 0,
    shiftKey: false,
    pointerId: 1,
    offsetX: 0,
    offsetY: 0,
    ...props,
  });
  target.dispatchEvent(event);
};

const HIT: HoverHit = { index: 3, id: "abc", label: "cat", x: 10, y: 10 };

describe("HoverPicker", () => {
  let container: HTMLDivElement;
  let pick: ReturnType<typeof vi.fn>;
  let onHover: ReturnType<typeof vi.fn>;
  let blocked: boolean;
  let picker: HoverPicker;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    blocked = false;
    pick = vi.fn(() => HIT);
    onHover = vi.fn();
    picker = new HoverPicker(container, {
      isBlocked: () => blocked,
      pick,
      onHover,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hit-tests only after the pointer settles", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    expect(pick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(pick).toHaveBeenCalledExactlyOnceWith(5, 6);
    expect(onHover).toHaveBeenCalledExactlyOnceWith(HIT);
  });

  it("hides a shown hit the moment the pointer moves again", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(onHover).toHaveBeenLastCalledWith(HIT);

    fire(container, "pointermove", { offsetX: 7, offsetY: 8 });
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("stays quiet when nothing is hit", () => {
    pick.mockReturnValue(null);
    fire(container, "pointermove", {});
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(onHover).not.toHaveBeenCalled();
  });

  it("ignores movement while buttons are down (camera drags)", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6, buttons: 1 });
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(pick).not.toHaveBeenCalled();
  });

  it("ignores movement while another interaction owns the pointer", () => {
    blocked = true;
    fire(container, "pointermove", {});
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(pick).not.toHaveBeenCalled();
  });

  it("clears on pointerdown and on pointerleave", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(onHover).toHaveBeenLastCalledWith(HIT);

    fire(container, "pointerdown", {});
    expect(onHover).toHaveBeenLastCalledWith(null);

    fire(container, "pointerup", {});
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(onHover).toHaveBeenLastCalledWith(HIT);

    fire(container, "pointerleave", {});
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("re-tests after the view changes under a still pointer", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(pick).toHaveBeenCalledTimes(1);

    // A wheel zoom: same pointer position, new projection
    picker.viewChanged();
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(pick).toHaveBeenCalledTimes(2);
  });

  it("forgets the pointer position on reset (new data)", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    picker.reset();
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    expect(pick).not.toHaveBeenCalled();
  });
});
