/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FALLBACK_TIMEOUT_PERIOD_MS = 30_000;

const hoisted = vi.hoisted(() => {
  // A stand-in for `@fiftyone/state`'s useRetryController. The annotation
  // controller layers on top of it, so we control its returned `canAttempt`
  // explicitly from each test.
  type RetryControllerHandle = {
    canAttempt: boolean;
    recordAttempt: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
  };
  const state = {
    handle: {
      canAttempt: true,
      recordAttempt: vi.fn(),
      reset: vi.fn(),
    } as RetryControllerHandle,
    rerender: (() => {}) as () => void,
  };
  return {
    state,
    useRetryControllerSpy: vi.fn(() => state.handle),
  };
});

vi.mock("@fiftyone/state", () => ({
  useRetryController: (...args: unknown[]) =>
    hoisted.useRetryControllerSpy(...args),
}));

import { usePersistenceRetryController } from "./usePersistenceRetryController";

const setInner = (canAttempt: boolean) => {
  hoisted.state.handle = {
    ...hoisted.state.handle,
    canAttempt,
  };
};

describe("usePersistenceRetryController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.useRetryControllerSpy.mockClear();
    hoisted.state.handle = {
      canAttempt: true,
      recordAttempt: vi.fn(),
      reset: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initial state: canAttempt=true, isUnhealthy=false", () => {
    const { result } = renderHook(() => usePersistenceRetryController());
    expect(result.current.canAttempt).toBe(true);
    expect(result.current.isUnhealthy).toBe(false);
  });

  it("delegates recordAttempt to the inner controller", () => {
    const { result } = renderHook(() => usePersistenceRetryController());
    result.current.recordAttempt();
    expect(hoisted.state.handle.recordAttempt).toHaveBeenCalledTimes(1);
  });

  it("when inner canAttempt drops to false, becomes unhealthy immediately and disables retries after the fallback timeout", () => {
    setInner(true);
    const { result, rerender } = renderHook(() =>
      usePersistenceRetryController(),
    );
    expect(result.current.isUnhealthy).toBe(false);

    setInner(false);
    rerender();

    expect(result.current.isUnhealthy).toBe(true);
    // canAttempt stays true until the fallback timer fires
    expect(result.current.canAttempt).toBe(true);

    act(() => {
      vi.advanceTimersByTime(FALLBACK_TIMEOUT_PERIOD_MS - 1);
    });
    expect(result.current.canAttempt).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.canAttempt).toBe(false);
  });

  it("if inner canAttempt recovers before the fallback timeout, the timeout is cleared and state resets", () => {
    setInner(true);
    const { result, rerender } = renderHook(() =>
      usePersistenceRetryController(),
    );

    setInner(false);
    rerender();
    expect(result.current.isUnhealthy).toBe(true);

    // Inner recovers before the timer fires
    setInner(true);
    rerender();
    expect(result.current.isUnhealthy).toBe(false);
    expect(result.current.canAttempt).toBe(true);

    // Advance past where the original timeout would have fired —
    // canAttempt should remain true (timer was cleared).
    act(() => {
      vi.advanceTimersByTime(FALLBACK_TIMEOUT_PERIOD_MS * 2);
    });
    expect(result.current.canAttempt).toBe(true);
  });

  it("reset() resets the inner controller AND the internal state", () => {
    setInner(false);
    const { result, rerender } = renderHook(() =>
      usePersistenceRetryController(),
    );

    // Drive into the disabled state
    act(() => {
      vi.advanceTimersByTime(FALLBACK_TIMEOUT_PERIOD_MS);
    });
    expect(result.current.canAttempt).toBe(false);

    // Reset
    act(() => {
      result.current.reset();
    });
    rerender();

    expect(hoisted.state.handle.reset).toHaveBeenCalledTimes(1);
    expect(result.current.canAttempt).toBe(true);
    expect(result.current.isUnhealthy).toBe(false);
  });

  it("passes maxAttempts=3 and a stable id to the inner useRetryController", () => {
    const { rerender } = renderHook(() => usePersistenceRetryController());
    const firstCall = hoisted.useRetryControllerSpy.mock.calls.at(-1)![0] as {
      id: string;
      maxAttempts: number;
    };
    expect(firstCall.maxAttempts).toBe(3);
    expect(typeof firstCall.id).toBe("string");

    rerender();
    const secondCall = hoisted.useRetryControllerSpy.mock.calls.at(-1)![0] as {
      id: string;
      maxAttempts: number;
    };
    // useMemo with empty deps → same id across renders.
    expect(secondCall.id).toBe(firstCall.id);
  });
});
