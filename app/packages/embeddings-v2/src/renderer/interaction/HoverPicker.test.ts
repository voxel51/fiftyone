// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { HOVER_INTERVAL_MS } from "../constants";
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
  let pick: Mock<(x: number, y: number) => HoverHit | null>;
  let onHover: Mock<(hit: HoverHit | null) => void>;
  let blocked: boolean;
  let picker: HoverPicker;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    blocked = false;
    pick = vi.fn((_x: number, _y: number) => HIT as HoverHit | null);
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

  it("hit-tests at most once per interval, with the latest pointer", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    fire(container, "pointermove", { offsetX: 7, offsetY: 8 });
    expect(pick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(pick).toHaveBeenCalledExactlyOnceWith(7, 8);
    expect(onHover).toHaveBeenCalledExactlyOnceWith(HIT);
  });

  // The flicker bug: hand jitter over one point used to tear the hover
  // down and remount it — the host must hear nothing at all
  it("stays silent while the pointer jitters over the same point", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(onHover).toHaveBeenCalledExactlyOnceWith(HIT);

    fire(container, "pointermove", { offsetX: 6, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    fire(container, "pointermove", { offsetX: 5, offsetY: 7 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);

    expect(pick).toHaveBeenCalledTimes(3);
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it("moves between points without a null in between", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);

    const other: HoverHit = { index: 4, id: "def", label: "dog", x: 40, y: 41 };
    pick.mockReturnValue(other);
    fire(container, "pointermove", { offsetX: 40, offsetY: 41 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);

    expect(onHover).toHaveBeenCalledTimes(2);
    expect(onHover).toHaveBeenLastCalledWith(other);
  });

  it("clears once the pointer tests empty space", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);

    pick.mockReturnValue(null);
    fire(container, "pointermove", { offsetX: 90, offsetY: 90 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("stays quiet when nothing is hit", () => {
    pick.mockReturnValue(null);
    fire(container, "pointermove", {});
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(onHover).not.toHaveBeenCalled();
  });

  it("ignores movement while buttons are down (camera drags)", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6, buttons: 1 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(pick).not.toHaveBeenCalled();
  });

  it("ignores movement while another interaction owns the pointer", () => {
    blocked = true;
    fire(container, "pointermove", {});
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(pick).not.toHaveBeenCalled();
  });

  it("clears on pointerdown and on pointerleave", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(onHover).toHaveBeenLastCalledWith(HIT);

    fire(container, "pointerdown", {});
    expect(onHover).toHaveBeenLastCalledWith(null);

    fire(container, "pointerup", {});
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(onHover).toHaveBeenLastCalledWith(HIT);

    fire(container, "pointerleave", {});
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  // A wheel zoom moves the point under a still pointer: the same index
  // at new screen coords must re-fire so the host re-anchors its ring
  it("re-anchors when the camera moves under a still pointer", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(onHover).toHaveBeenLastCalledWith(HIT);

    const moved = { ...HIT, x: 20, y: 24 };
    pick.mockReturnValue(moved);
    picker.viewChanged();
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(onHover).toHaveBeenLastCalledWith(moved);
  });

  it("forgets the pointer position on reset (new data)", () => {
    fire(container, "pointermove", { offsetX: 5, offsetY: 6 });
    picker.reset();
    vi.advanceTimersByTime(HOVER_INTERVAL_MS);
    expect(pick).not.toHaveBeenCalled();
  });
});
