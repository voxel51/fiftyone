import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncedNavigator } from "./debouncedNavigator";

describe("createDebouncedNavigator", () => {
  let navigateFn: ReturnType<typeof vi.fn>;
  let onNavigationStart: ReturnType<typeof vi.fn>;
  let isNavigationIllegalWhen: ReturnType<typeof vi.fn>;
  let debouncedNavigator: ReturnType<typeof createDebouncedNavigator>;

  beforeEach(() => {
    vi.useFakeTimers();
    navigateFn = vi.fn();
    onNavigationStart = vi.fn();
    isNavigationIllegalWhen = vi.fn().mockReturnValue(false);
    debouncedNavigator = createDebouncedNavigator({
      isNavigationIllegalWhen,
      navigateFn,
      onNavigationStart,
      debounceTime: 100,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it("should navigate immediately on the first call", () => {
    debouncedNavigator.navigate();

    expect(isNavigationIllegalWhen).toHaveBeenCalled();
    expect(onNavigationStart).toHaveBeenCalledTimes(1);
    expect(navigateFn).toHaveBeenCalledWith(1);
  });

  it("should debounce subsequent calls and accumulate offset", () => {
    // immediate call
    debouncedNavigator.navigate();
    // accumulated
    debouncedNavigator.navigate();
    // accumulated
    debouncedNavigator.navigate();

    // only the first call
    expect(onNavigationStart).toHaveBeenCalledTimes(1);

    // advance time less than debounceTime
    vi.advanceTimersByTime(50);
    // another accumulated call
    debouncedNavigator.navigate();

    // advance time to trigger debounce after the last navigate
    // need to advance full debounceTime after last call
    vi.advanceTimersByTime(100);

    // first immediate call + after debounce
    expect(onNavigationStart).toHaveBeenCalledTimes(2);
    // immediate call
    expect(navigateFn).toHaveBeenCalledWith(1);
    // accumulated calls
    expect(navigateFn).toHaveBeenCalledWith(3);
  });

  it("should reset after debounce period", () => {
    // immediate call
    debouncedNavigator.navigate();
    // accumulated
    debouncedNavigator.navigate();

    vi.advanceTimersByTime(100);

    // next navigate call should be immediate again
    debouncedNavigator.navigate();

    expect(onNavigationStart).toHaveBeenCalledTimes(3);
    expect(navigateFn).toHaveBeenNthCalledWith(1, 1);
    // accumulated offset
    expect(navigateFn).toHaveBeenNthCalledWith(2, 1);
    expect(navigateFn).toHaveBeenNthCalledWith(3, 1);
  });

  it("should not navigate when isNavigationIllegalWhen returns true", () => {
    isNavigationIllegalWhen.mockReturnValueOnce(true);

    debouncedNavigator.navigate();

    expect(isNavigationIllegalWhen).toHaveBeenCalled();
    expect(onNavigationStart).not.toHaveBeenCalled();
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it("should cancel pending navigation when cleanup is called", () => {
    // immediate call
    debouncedNavigator.navigate();
    // accumulated
    debouncedNavigator.navigate();
    debouncedNavigator.cleanup();

    vi.advanceTimersByTime(200);

    // only the immediate call
    expect(onNavigationStart).toHaveBeenCalledTimes(1);
    expect(navigateFn).toHaveBeenCalledTimes(1);
    expect(navigateFn).toHaveBeenCalledWith(1);
  });

  it("should clear timeout when isNavigationIllegalWhen returns true during debounce", () => {
    // immediate call
    debouncedNavigator.navigate();
    // accumulated
    debouncedNavigator.navigate();

    isNavigationIllegalWhen.mockReturnValue(true);
    // should not accumulate further
    debouncedNavigator.navigate();

    vi.advanceTimersByTime(100);

    // only the initial navigation
    expect(onNavigationStart).toHaveBeenCalledTimes(1); //
    // only immediate call
    expect(navigateFn).toHaveBeenCalledTimes(1);
    expect(navigateFn).toHaveBeenCalledWith(1);

    // reset mock to allow navigation
    isNavigationIllegalWhen.mockReturnValue(false);

    // should navigate immediately
    debouncedNavigator.navigate();

    expect(onNavigationStart).toHaveBeenCalledTimes(2);
    expect(navigateFn).toHaveBeenCalledTimes(2);
    expect(navigateFn).toHaveBeenCalledWith(1);
  });

  it("should handle multiple sequences correctly", () => {
    // first sequence
    // immediate
    debouncedNavigator.navigate();
    // accumulated
    debouncedNavigator.navigate();
    debouncedNavigator.navigate();

    vi.advanceTimersByTime(100);

    expect(onNavigationStart).toHaveBeenCalledTimes(2);
    expect(navigateFn).toHaveBeenNthCalledWith(1, 1);
    expect(navigateFn).toHaveBeenNthCalledWith(2, 2);

    // second sequence
    // immediate call
    debouncedNavigator.navigate();
    // accumulated
    debouncedNavigator.navigate();

    vi.advanceTimersByTime(100);

    expect(onNavigationStart).toHaveBeenCalledTimes(4);
    expect(navigateFn).toHaveBeenNthCalledWith(3, 1);
    expect(navigateFn).toHaveBeenNthCalledWith(4, 1);
  });

  it("should reset accumulatedOffset when isNavigationIllegalWhen returns true", () => {
    // immediate call
    debouncedNavigator.navigate();
    // accumulated
    debouncedNavigator.navigate();

    isNavigationIllegalWhen.mockReturnValueOnce(true);

    // should not accumulate further
    debouncedNavigator.navigate();

    vi.advanceTimersByTime(100);

    // only the immediate call
    expect(onNavigationStart).toHaveBeenCalledTimes(1);
    expect(navigateFn).toHaveBeenCalledTimes(1);
    expect(navigateFn).toHaveBeenCalledWith(1);
  });
});
