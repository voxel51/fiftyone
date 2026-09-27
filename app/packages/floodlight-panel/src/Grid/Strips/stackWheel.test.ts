import { afterEach, describe, expect, test, vi } from "vitest";
import { createHoverKeys, isEditable } from "./hoverKeys";
import { createWheelSteps, depthGesture, keyStep } from "./stackWheel";

const wheel = (
  deltaY: number,
  modifiers: { altKey?: boolean; ctrlKey?: boolean; deltaMode?: number } = {},
) => ({
  altKey: false,
  ctrlKey: false,
  deltaMode: 0,
  deltaX: 0,
  deltaY,
  ...modifiers,
});

describe("depthGesture", () => {
  test("classifies Alt+wheel, ctrl+wheel pinch, and plain wheel", () => {
    expect(depthGesture(wheel(10, { altKey: true }))).toBe("wheel");
    expect(depthGesture(wheel(10, { ctrlKey: true }))).toBe("pinch");
    expect(depthGesture(wheel(10))).toBeNull();
  });
});

describe("createWheelSteps", () => {
  test("ignores a plain wheel", () => {
    const steps = createWheelSteps();
    expect(steps.push(wheel(120), 0)).toBeNull();
  });

  test("one mouse notch is one step, in either unit", () => {
    const steps = createWheelSteps();
    expect(steps.push(wheel(100, { altKey: true }), 0)).toBe(1);
    expect(steps.push(wheel(-120, { altKey: true }), 10)).toBe(-1);
    expect(steps.push(wheel(3, { altKey: true, deltaMode: 1 }), 20)).toBe(1);
  });

  test("a fast notch skips several", () => {
    const steps = createWheelSteps();
    expect(steps.push(wheel(300, { altKey: true }), 0)).toBe(3);
    expect(steps.push(wheel(9, { altKey: true, deltaMode: 1 }), 10)).toBe(3);
  });

  test("accumulates smooth deltas into steps with a carried remainder", () => {
    const steps = createWheelSteps({ wheelStep: 40 });
    const alt = { altKey: true };
    expect(steps.push(wheel(15, alt), 0)).toBe(0);
    expect(steps.push(wheel(15, alt), 16)).toBe(0);
    expect(steps.push(wheel(15, alt), 32)).toBe(1);
    // 5 carried + 45 = 50
    expect(steps.push(wheel(45, alt), 48)).toBe(1);
    expect(steps.push(wheel(30, alt), 64)).toBe(1);
  });

  test("an idle gap drops the remainder", () => {
    const steps = createWheelSteps({ wheelStep: 40, idle: 200 });
    const alt = { altKey: true };
    expect(steps.push(wheel(30, alt), 0)).toBe(0);
    expect(steps.push(wheel(30, alt), 500)).toBe(0);
    expect(steps.push(wheel(10, alt), 520)).toBe(1);
  });

  test("reversing direction starts a fresh accumulation", () => {
    const steps = createWheelSteps({ wheelStep: 40 });
    const alt = { altKey: true };
    expect(steps.push(wheel(30, alt), 0)).toBe(0);
    expect(steps.push(wheel(-40, alt), 10)).toBe(-1);
  });

  test("pinching out moves deeper and pinching in comes back", () => {
    const steps = createWheelSteps({ pinchStep: 12 });
    const pinch = { ctrlKey: true };
    expect(steps.push(wheel(-6, pinch), 0)).toBe(0);
    expect(steps.push(wheel(-6, pinch), 10)).toBe(1);
    expect(steps.push(wheel(-30, pinch), 20)).toBe(2);
    expect(steps.push(wheel(24, pinch), 30)).toBe(-2);
  });

  test("uses the horizontal delta when it dominates", () => {
    const steps = createWheelSteps();
    expect(steps.push({ ...wheel(0, { altKey: true }), deltaX: 100 }, 0)).toBe(
      1,
    );
  });
});

describe("keyStep", () => {
  test("maps arrows and brackets", () => {
    expect(keyStep("ArrowDown")).toBe(1);
    expect(keyStep("]")).toBe(1);
    expect(keyStep("ArrowUp")).toBe(-1);
    expect(keyStep("[")).toBe(-1);
    expect(keyStep("a")).toBe(0);
  });
});

describe("hover keys", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const press = (key: string, init: KeyboardEventInit = {}) =>
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
      ...init,
    });

  const setup = () => {
    const keys = createHoverKeys();
    const stack = { step: vi.fn() };
    const listener = (event: KeyboardEvent) =>
      keys.keydown(event, document.activeElement);
    window.addEventListener("keydown", listener);
    return {
      keys,
      stack,
      dispose: () => window.removeEventListener("keydown", listener),
    };
  };

  test("arrows step the hovered stack and prevent the scroll", () => {
    const { dispose, keys, stack } = setup();
    keys.enter(stack);

    const down = press("ArrowDown");
    document.body.dispatchEvent(down);
    document.body.dispatchEvent(press("ArrowUp"));
    expect(stack.step.mock.calls).toEqual([[1], [-1]]);
    expect(down.defaultPrevented).toBe(true);
    dispose();
  });

  test("nothing steps once the pointer leaves", () => {
    const { dispose, keys, stack } = setup();
    keys.enter(stack);
    keys.leave(stack);

    const down = press("ArrowDown");
    document.body.dispatchEvent(down);
    expect(stack.step).not.toHaveBeenCalled();
    expect(down.defaultPrevented).toBe(false);
    dispose();
  });

  test("leaving an earlier stack keeps the one now hovered", () => {
    const { dispose, keys, stack } = setup();
    const other = { step: vi.fn() };
    keys.enter(other);
    keys.enter(stack);
    keys.leave(other);

    document.body.dispatchEvent(press("ArrowDown"));
    expect(stack.step).toHaveBeenCalledWith(1);
    expect(other.step).not.toHaveBeenCalled();
    dispose();
  });

  test("a focused stack handles the key first and wins over hover", () => {
    const { dispose, keys, stack } = setup();
    const focusedStep = vi.fn();
    const focused = document.createElement("div");
    focused.tabIndex = 0;
    focused.addEventListener("keydown", (event) => {
      event.preventDefault();
      focusedStep(1);
    });
    document.body.appendChild(focused);
    focused.focus();
    keys.enter(stack);

    focused.dispatchEvent(press("ArrowDown"));
    expect(focusedStep).toHaveBeenCalledTimes(1);
    expect(stack.step).not.toHaveBeenCalled();
    dispose();
  });

  test("typing in an input, select or editable text is left alone", () => {
    const { dispose, keys, stack } = setup();
    keys.enter(stack);

    for (const tag of ["input", "select", "textarea"]) {
      const field = document.createElement(tag);
      document.body.appendChild(field);
      field.focus();
      const down = press("ArrowDown");
      field.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(false);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.innerHTML = "<span>text</span>";
    document.body.appendChild(editable);
    expect(isEditable(editable.firstElementChild)).toBe(true);
    expect(stack.step).not.toHaveBeenCalled();
    dispose();
  });

  test("modified arrows and other keys are ignored", () => {
    const { dispose, keys, stack } = setup();
    keys.enter(stack);
    document.body.dispatchEvent(press("ArrowDown", { shiftKey: true }));
    document.body.dispatchEvent(press("ArrowDown", { metaKey: true }));
    document.body.dispatchEvent(press("]"));
    expect(stack.step).not.toHaveBeenCalled();
    dispose();
  });
});
