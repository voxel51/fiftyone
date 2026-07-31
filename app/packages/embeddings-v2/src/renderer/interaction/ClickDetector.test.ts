// @vitest-environment jsdom
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { ClickDetector } from "./ClickDetector";

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

describe("ClickDetector", () => {
  let container: HTMLDivElement;
  let onClick: Mock<(x: number, y: number) => void>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    onClick = vi.fn();
    new ClickDetector(container, { onClick });
  });

  it("reports a press+release within the slop as a click", () => {
    fire(container, "pointerdown", { offsetX: 10, offsetY: 10 });
    fire(container, "pointerup", { offsetX: 12, offsetY: 11 });
    expect(onClick).toHaveBeenCalledExactlyOnceWith(12, 11);
  });

  it("ignores drags beyond the slop", () => {
    fire(container, "pointerdown", { offsetX: 10, offsetY: 10 });
    fire(container, "pointerup", { offsetX: 30, offsetY: 30 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("ignores modified and non-primary presses", () => {
    fire(container, "pointerdown", { shiftKey: true });
    fire(container, "pointerup", {});
    fire(container, "pointerdown", { button: 1 });
    fire(container, "pointerup", { button: 1 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("resets on pointercancel", () => {
    fire(container, "pointerdown", {});
    fire(container, "pointercancel", {});
    fire(container, "pointerup", {});
    expect(onClick).not.toHaveBeenCalled();
  });

  it("matches press and release by pointer id", () => {
    fire(container, "pointerdown", { pointerId: 1 });
    fire(container, "pointerup", { pointerId: 2 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("stops listening after destroy", () => {
    const detector = new ClickDetector(container, { onClick });
    detector.destroy();
    fire(container, "pointerdown", {});
    fire(container, "pointerup", {});
    // The beforeEach detector still fires; the destroyed one must not
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
