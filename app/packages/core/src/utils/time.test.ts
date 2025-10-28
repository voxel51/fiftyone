import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { predicateOrFallbackAfterTimeout } from "./time";

describe("predicateOrFallbackAfterTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should return true immediately when predicate returns true", () => {
    const predicate = vi.fn(() => true);
    const wrapper = predicateOrFallbackAfterTimeout(predicate, false, 1000);

    const result = wrapper();

    expect(result).toBe(true);
    expect(predicate).toHaveBeenCalledOnce();
  });

  it("should return false when predicate returns false and timeout has not elapsed", () => {
    const predicate = vi.fn(() => false);
    const wrapper = predicateOrFallbackAfterTimeout(predicate, true, 1000);

    const result = wrapper();

    expect(result).toBe(false);
    expect(predicate).toHaveBeenCalledOnce();
  });

  it("should return fallback value when predicate is false after timeout elapses", () => {
    const predicate = vi.fn(() => false);
    const wrapper = predicateOrFallbackAfterTimeout(predicate, true, 1000);

    // First call - should return false, starts timer
    const call1 = wrapper();
    expect(call1).toBe(false);

    // Advance time by 999ms - still within timeout
    vi.advanceTimersByTime(999);
    const call2 = wrapper();
    expect(call2).toBe(false);

    // Advance time by 2ms - now past 1000ms total
    vi.advanceTimersByTime(2);
    const call3 = wrapper();
    expect(call3).toBe(true); // Should return fallback value
  });

  it("should reset timer when predicate becomes true", () => {
    const predicate = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const wrapper = predicateOrFallbackAfterTimeout(predicate, true, 1000);

    // Call 1: predicate returns false, start timer
    expect(wrapper()).toBe(false);

    // Advance time by 500ms
    vi.advanceTimersByTime(500);

    // Call 2: predicate still false, timer still running
    expect(wrapper()).toBe(false);

    // Advance time by 400ms (total 900ms)
    vi.advanceTimersByTime(400);

    // Call 3: predicate returns true, should reset timer
    expect(wrapper()).toBe(true);

    // Advance time by 600ms (past original timeout, but timer was reset)
    vi.advanceTimersByTime(600);

    // Call 4: predicate returns false again
    expect(wrapper()).toBe(false); // Within new timeout window

    // Advance time by 1000ms more (2000ms total from reset)
    vi.advanceTimersByTime(1000);

    // Should now return fallback value
    expect(wrapper()).toBe(true);
  });

  it("should use different fallback values", () => {
    const predicate = vi.fn(() => false);

    // Test with false as fallback
    const wrapper1 = predicateOrFallbackAfterTimeout(predicate, false, 100);

    wrapper1();
    vi.advanceTimersByTime(100);
    expect(wrapper1()).toBe(false);

    // Test with true as fallback
    const predicate2 = vi.fn(() => false);
    const wrapper2 = predicateOrFallbackAfterTimeout(predicate2, true, 100);

    wrapper2();
    vi.advanceTimersByTime(100);
    expect(wrapper2()).toBe(true);
  });

  it("should handle rapid successive calls before timeout", () => {
    const predicate = vi.fn(() => false);
    const wrapper = predicateOrFallbackAfterTimeout(predicate, true, 1000);

    // Rapid calls should all return false
    expect(wrapper()).toBe(false);
    expect(wrapper()).toBe(false);
    expect(wrapper()).toBe(false);
    expect(wrapper()).toBe(false);

    expect(predicate).toHaveBeenCalledTimes(4);
  });

  it("should respect different timeout values", () => {
    const predicate = vi.fn(() => false);
    const wrapper = predicateOrFallbackAfterTimeout(predicate, true, 500);

    wrapper();
    vi.advanceTimersByTime(499);
    expect(wrapper()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(wrapper()).toBe(true); // Should return fallback at 500ms
  });

  it("should handle predicate that alternates every call", () => {
    let callCount = 0;
    const predicate = vi.fn(() => {
      callCount++;
      return callCount % 2 === 0; // returns false, true, false, true, etc.
    });

    const wrapper = predicateOrFallbackAfterTimeout(predicate, true, 1000);

    // Call 1: returns false
    expect(wrapper()).toBe(false);

    // Call 2: returns true (resets timer)
    expect(wrapper()).toBe(true);

    // Call 3: returns false (timer restarted)
    expect(wrapper()).toBe(false);

    vi.advanceTimersByTime(1000);

    // Call 4: returns true (from fallback after timeout)
    expect(wrapper()).toBe(true);
  });

  it("should not return fallback until timeout actually elapses", () => {
    const predicate = vi.fn(() => false);
    const wrapper = predicateOrFallbackAfterTimeout(predicate, true, 1000);

    wrapper();

    // Try various times just before timeout
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(false);

    // One more 100ms to reach exactly 1000ms
    vi.advanceTimersByTime(100);
    expect(wrapper()).toBe(true);
  });

  it("should work with very short timeouts", () => {
    const predicate = vi.fn(() => false);
    const wrapper = predicateOrFallbackAfterTimeout(predicate, true, 1);

    wrapper();
    vi.advanceTimersByTime(1);
    expect(wrapper()).toBe(true);
  });

  it("should call predicate each time wrapper is called", () => {
    const predicate = vi.fn(() => true);
    const wrapper = predicateOrFallbackAfterTimeout(predicate, false, 1000);

    wrapper();
    wrapper();
    wrapper();

    expect(predicate).toHaveBeenCalledTimes(3);
  });
});
