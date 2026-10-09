/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useSidebarSlide, { SLIDE_MS } from "./useSidebarSlide";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame"] });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => vi.useRealTimers());

describe("useSidebarSlide", () => {
  it("keeps the sidebar while it slides out, then drops it", () => {
    const { rerender, result } = renderHook(
      ({ show }) => useSidebarSlide(show),
      { initialProps: { show: true } },
    );
    expect(result.current.gridStyle).toBeUndefined();

    rerender({ show: false });
    expect(result.current.rendered).toBe(true);
    expect(result.current.gridStyle?.transform).toMatch(/^translateX\(-/);

    act(() => vi.advanceTimersByTime(SLIDE_MS));
    expect(result.current.rendered).toBe(false);
    expect(result.current.gridStyle).toBeUndefined();
  });

  it("slides the sidebar in over the grid, then lays it out", () => {
    const { rerender, result } = renderHook(
      ({ show }) => useSidebarSlide(show),
      { initialProps: { show: false } },
    );
    expect(result.current.rendered).toBe(false);

    rerender({ show: true });
    expect(result.current.rendered).toBe(true);
    expect(result.current.sidebarStyle?.position).toBe("absolute");

    act(() => vi.advanceTimersToNextFrame());
    act(() => vi.advanceTimersToNextFrame());
    expect(result.current.gridStyle?.transform).toMatch(/^translateX\(\d/);

    act(() => vi.advanceTimersByTime(SLIDE_MS));
    expect(result.current.sidebarStyle).toBeUndefined();
    expect(result.current.gridStyle).toBeUndefined();
  });
});
