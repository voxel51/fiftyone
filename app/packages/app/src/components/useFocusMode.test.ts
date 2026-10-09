import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import useFocusMode from "./useFocusMode";

const press = (key: string, target: EventTarget = window, init = {}) =>
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
  });

describe("useFocusMode", () => {
  it("toggles on F and leaves on Escape", () => {
    const { result } = renderHook(() => useFocusMode(true));

    press("f");
    expect(result.current.focused).toBe(true);
    press("F");
    expect(result.current.focused).toBe(false);
    press("f");
    press("Escape");
    expect(result.current.focused).toBe(false);
  });

  it("toggles and exits from its controls", () => {
    const { result } = renderHook(() => useFocusMode(true));

    act(() => result.current.toggle());
    expect(result.current.focused).toBe(true);
    act(() => result.current.exit());
    expect(result.current.focused).toBe(false);
  });

  it("leaves F to text fields and shortcuts", () => {
    const { result } = renderHook(() => useFocusMode(true));
    const input = document.body.appendChild(document.createElement("input"));

    press("f", input);
    press("f", window, { metaKey: true });
    expect(result.current.focused).toBe(false);
    input.remove();
  });

  it("yields its keys while the sample page is open", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useFocusMode(enabled),
      { initialProps: { enabled: true } },
    );
    press("f");
    expect(result.current.focused).toBe(true);

    rerender({ enabled: false });
    press("f");
    press("Escape");
    // Still in focus mode for when the sample closes
    expect(result.current.focused).toBe(true);
  });
});
