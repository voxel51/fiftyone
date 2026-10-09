/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useThumbMotion from "./useThumbMotion";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
});
afterEach(() => vi.useRealTimers());

const setup = () => {
  const el = document.createElement("div");
  const { result } = renderHook(() =>
    useThumbMotion({ span: 0, start: "top", thumb: { current: el } }),
  );
  const top = () => parseFloat(el.style.top);
  return { aim: result.current, top };
};

describe("useThumbMotion", () => {
  it("places the first position at once", () => {
    const { aim, top } = setup();
    act(() => aim(0.4));
    expect(top()).toBeCloseTo(40);
  });

  it("eases toward a new position without overshooting", () => {
    const { aim, top } = setup();
    act(() => aim(0));
    act(() => aim(1));
    act(() => vi.advanceTimersToNextFrame());
    const first = top();
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(100);

    act(() => vi.advanceTimersByTime(2000));
    expect(top()).toBeCloseTo(100);
  });

  it("places a drag at once", () => {
    const { aim, top } = setup();
    act(() => aim(0));
    act(() => aim(0.7, true));
    expect(top()).toBeCloseTo(70);
  });
});
