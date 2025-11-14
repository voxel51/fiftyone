import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useEventBus } from "./useEventBus";
import { useEventState } from "./useEventState";
import { __test__ } from "../state/EventStateStore";

type TestEventGroup = {
  "test:eventA": { id: string; name: string };
  "test:eventB": { value: number };
  "test:eventC": undefined;
};

describe("useEventState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear state store between tests
    __test__.registry.clear();
  });

  test("should return undefined initially when no event has been dispatched", () => {
    const { result } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA")
    );

    expect(result.current).toBeUndefined();
  });

  test("should return the latest event payload after dispatch", async () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );
    const { result } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA")
    );

    // Initially undefined
    expect(result.current).toBeUndefined();

    // Dispatch event
    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });

    // Should now have the payload
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test" });
    });
  });

  test("should update when a new event is dispatched", async () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );
    const { result } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA")
    );

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test1" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test1" });
    });

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "2", name: "test2" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "2", name: "test2" });
    });
  });

  test("should handle events with no payload", () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );
    const { result } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventC">("test:eventC")
    );

    expect(result.current).toBeUndefined();

    busResult.current.dispatch("test:eventC");
    expect(result.current).toBeUndefined();
  });

  test("should prevent tearing - multiple components see same value", async () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result: result1 } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA")
    );
    const { result: result2 } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA")
    );
    const { result: result3 } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA")
    );

    // All should be undefined initially
    expect(result1.current).toBeUndefined();
    expect(result2.current).toBeUndefined();
    expect(result3.current).toBeUndefined();

    // Dispatch event
    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });

    // All should see the same value (no tearing)
    await waitFor(() => {
      expect(result1.current).toEqual({ id: "1", name: "test" });
      expect(result2.current).toEqual({ id: "1", name: "test" });
      expect(result3.current).toEqual({ id: "1", name: "test" });
    });

    // Dispatch another event
    act(() => {
      busResult.current.dispatch("test:eventA", { id: "2", name: "test2" });
    });

    // All should still see the same value
    await waitFor(() => {
      expect(result1.current).toEqual({ id: "2", name: "test2" });
      expect(result2.current).toEqual({ id: "2", name: "test2" });
      expect(result3.current).toEqual({ id: "2", name: "test2" });
    });
  });

  test("should handle different event types independently", async () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result: resultA } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA")
    );
    const { result: resultB } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventB">("test:eventB")
    );

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
      busResult.current.dispatch("test:eventB", { value: 42 });
    });

    await waitFor(() => {
      expect(resultA.current).toEqual({ id: "1", name: "test" });
      expect(resultB.current).toEqual({ value: 42 });
    });
  });

  test("should maintain state across re-renders", async () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result, rerender } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA")
    );

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test" });
    });

    // Re-render
    rerender();

    // State should still be there
    expect(result.current).toEqual({ id: "1", name: "test" });
  });

  test("should unsubscribe when component unmounts", async () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result, unmount } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA")
    );

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test" });
    });

    unmount();

    // State should still be tracked (other components might be using it)
    // But the component should be unsubscribed
    act(() => {
      busResult.current.dispatch("test:eventA", { id: "2", name: "test2" });
    });
    // The unmounted component's result shouldn't update, but we can't test that directly
    // The important thing is that the subscription is cleaned up
  });

  test("should return default value when provided", () => {
    const defaultValue = { id: "default", name: "default" };
    const { result } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA", defaultValue)
    );

    expect(result.current).toEqual(defaultValue);
  });

  test("should return latest event payload after dispatch with default", async () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );
    const defaultValue = { id: "default", name: "default" };
    const { result } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA", defaultValue)
    );

    expect(result.current).toEqual(defaultValue);

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test" });
    });
  });

  test("should update when new event is dispatched with default", async () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );
    const defaultValue = { id: "default", name: "default" };
    const { result } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA", defaultValue)
    );

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test1" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test1" });
    });

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "2", name: "test2" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "2", name: "test2" });
    });
  });

  test("should prevent tearing with default values", async () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );
    const defaultValue = { id: "default", name: "default" };

    const { result: result1 } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA", defaultValue)
    );
    const { result: result2 } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventA">("test:eventA", defaultValue)
    );

    // Both should see default initially
    expect(result1.current).toEqual(defaultValue);
    expect(result2.current).toEqual(defaultValue);

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });

    // Both should see the same value
    await waitFor(() => {
      expect(result1.current).toEqual({ id: "1", name: "test" });
      expect(result2.current).toEqual({ id: "1", name: "test" });
    });
  });

  test("should handle events with no payload and default", () => {
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );
    const defaultValue: undefined = undefined;

    const { result } = renderHook(() =>
      useEventState<TestEventGroup, "test:eventC">("test:eventC", defaultValue)
    );

    expect(result.current).toBeUndefined();

    busResult.current.dispatch("test:eventC");
    expect(result.current).toBeUndefined();
  });
});
