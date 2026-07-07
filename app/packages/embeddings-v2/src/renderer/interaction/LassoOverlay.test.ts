// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Polygon } from "../types";
import { LassoOverlay } from "./LassoOverlay";

const fire = (
  target: HTMLElement,
  type: string,
  props: Record<string, unknown> = {},
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    button: 0,
    buttons: 1,
    shiftKey: false,
    pointerId: 1,
    offsetX: 0,
    offsetY: 0,
    ...props,
  });
  target.dispatchEvent(event);
};

describe("LassoOverlay", () => {
  let parent: HTMLDivElement;
  let container: HTMLDivElement;
  let onComplete: ReturnType<typeof vi.fn>;
  let overlay: LassoOverlay;

  beforeEach(() => {
    parent = document.createElement("div");
    container = document.createElement("div");
    parent.appendChild(container);
    document.body.appendChild(parent);
    // jsdom has no pointer capture; the overlay only needs it to exist
    (container as unknown as Record<string, unknown>).setPointerCapture = () =>
      undefined;
    onComplete = vi.fn();
    overlay = new LassoOverlay(container, {
      shouldStart: (event) => event.button === 0 && !event.shiftKey,
      onComplete,
    });
  });

  const drag = (points: Polygon) => {
    const [first, ...rest] = points;
    fire(container, "pointerdown", { offsetX: first[0], offsetY: first[1] });
    for (const [x, y] of rest) {
      fire(container, "pointermove", { offsetX: x, offsetY: y });
    }
    const last = points[points.length - 1];
    fire(container, "pointerup", { offsetX: last[0], offsetY: last[1] });
  };

  it("delivers the polygon for a real lasso drag", () => {
    drag([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      0,
      10,
    );
  });

  it("reports a too-short gesture as a click with its release position", () => {
    drag([
      [5, 5],
      [6, 6],
    ]);
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(null, 6, 6);
  });

  it("skips sub-3px moves to keep the polygon small", () => {
    drag([
      [0, 0],
      [1, 1],
      [2, 2],
      [10, 10],
      [20, 20],
    ]);
    const polygon = onComplete.mock.calls[0][0];
    expect(polygon).toEqual([
      [0, 0],
      [10, 10],
      [20, 20],
    ]);
  });

  it("never starts when the adapter declines the gesture", () => {
    fire(container, "pointerdown", { shiftKey: true });
    expect(overlay.isDrawing()).toBe(false);
    fire(container, "pointermove", { offsetX: 10, offsetY: 10 });
    fire(container, "pointerup", { offsetX: 10, offsetY: 10 });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("keeps drawing drags away from other listeners", () => {
    const parentMove = vi.fn();
    parent.addEventListener("pointermove", parentMove);

    fire(container, "pointerdown", { offsetX: 0, offsetY: 0 });
    expect(overlay.isDrawing()).toBe(true);
    fire(container, "pointermove", { offsetX: 10, offsetY: 10 });
    expect(parentMove).not.toHaveBeenCalled();

    fire(container, "pointerup", { offsetX: 10, offsetY: 10 });
    expect(overlay.isDrawing()).toBe(false);

    // Not drawing: moves propagate normally (camera pans need them)
    fire(container, "pointermove", { offsetX: 20, offsetY: 20, buttons: 0 });
    expect(parentMove).toHaveBeenCalledTimes(1);
  });

  it("draws and clears the SVG path", () => {
    const path = container.querySelector("path");
    fire(container, "pointerdown", { offsetX: 0, offsetY: 0 });
    fire(container, "pointermove", { offsetX: 10, offsetY: 0 });
    expect(path?.getAttribute("d")).toContain("M0,0L10,0");
    fire(container, "pointerup", { offsetX: 10, offsetY: 0 });
    expect(path?.getAttribute("d")).toBe("");
  });

  it("removes its overlay on destroy", () => {
    expect(container.querySelector("svg")).not.toBeNull();
    overlay.destroy();
    expect(container.querySelector("svg")).toBeNull();
  });
});
