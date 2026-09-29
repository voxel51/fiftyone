import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  gestureLabel,
  heldGestureOf,
  useHeldGesture,
  useTrackHeldGesture,
} from "./bucketGestures";

afterEach(() => {
  cleanup();
});

describe("bucket gestures", () => {
  it("speaks the platform's keys", () => {
    expect(gestureLabel("click", true)).toBe("click");
    expect(gestureLabel("command", true)).toBe("⌘-click");
    expect(gestureLabel("option", true)).toBe("⌥-click");
    expect(gestureLabel("command", false)).toBe("Ctrl-click");
    expect(gestureLabel("option", false)).toBe("Alt-click");
  });

  it("reads the held modifier from key events, Option winning over Command", () => {
    expect(
      heldGestureOf({ altKey: false, metaKey: false, ctrlKey: false }),
    ).toBeNull();
    expect(
      heldGestureOf({ altKey: false, metaKey: true, ctrlKey: false }),
    ).toBe("command");
    expect(
      heldGestureOf({ altKey: false, metaKey: false, ctrlKey: true }),
    ).toBe("command");
    expect(heldGestureOf({ altKey: true, metaKey: true, ctrlKey: false })).toBe(
      "option",
    );
  });

  it("tracks modifiers on the window only while enabled, and releases on blur", () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        useTrackHeldGesture(enabled);
        return useHeldGesture();
      },
      { initialProps: { enabled: true } },
    );
    expect(result.current).toBeNull();
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Meta", metaKey: true }),
      );
    });
    expect(result.current).toBe("command");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Alt",
          altKey: true,
          metaKey: true,
        }),
      );
    });
    expect(result.current).toBe("option");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
    });
    expect(result.current).toBeNull();
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }),
      );
    });
    expect(result.current).toBe("command");
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(result.current).toBeNull();
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Meta", metaKey: true }),
      );
    });
    expect(result.current).toBe("command");
    rerender({ enabled: false });
    expect(result.current).toBeNull();
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Meta", metaKey: true }),
      );
    });
    expect(result.current).toBeNull();
  });
});
