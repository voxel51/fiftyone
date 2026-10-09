import { afterEach, describe, expect, test, vi } from "vitest";
import { createSettle } from "./settle";

afterEach(() => vi.useRealTimers());

describe("createSettle", () => {
  test("runs once after the last trigger in a burst", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const settle = createSettle(callback, 150);

    settle.trigger();
    vi.advanceTimersByTime(100);
    settle.trigger();
    vi.advanceTimersByTime(100);
    settle.trigger();
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("cancel drops a pending run", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const settle = createSettle(callback, 150);

    settle.trigger();
    settle.cancel();
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
  });
});
