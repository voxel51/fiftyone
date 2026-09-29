import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useSettled } from "./useSettled";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSettled", () => {
  test("holds the first value, then takes the last value of a burst", () => {
    const { rerender, result } = renderHook(
      ({ value }) => useSettled(value, 150),
      { initialProps: { value: -3 } },
    );
    expect(result.current).toBe(-3);

    rerender({ value: -4 });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: -5 });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(-3);

    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe(-5);
  });

  test("does not settle after unmounting", () => {
    const { rerender, result, unmount } = renderHook(
      ({ value }) => useSettled(value, 150),
      { initialProps: { value: 1 } },
    );
    rerender({ value: 2 });
    unmount();
    act(() => vi.advanceTimersByTime(150));

    expect(result.current).toBe(1);
  });
});
