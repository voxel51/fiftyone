import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useEventBus } from "./useEventBus";

type TestEventGroup = {
  "test:eventA": { id: string; name: string };
  "test:eventB": { value: number };
  "test:eventC": undefined;
};

describe("useEventBus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should return an event bus with on, off, and dispatch methods", () => {
    const { result } = renderHook(() => useEventBus<TestEventGroup>());

    expect(result.current).toBeDefined();
    expect(typeof result.current.on).toBe("function");
    expect(typeof result.current.off).toBe("function");
    expect(typeof result.current.dispatch).toBe("function");
  });

  test("should return the same instance for the same channel ID", () => {
    const { result: result1 } = renderHook(() =>
      useEventBus<TestEventGroup>({ channelId: "channel1" })
    );
    const { result: result2 } = renderHook(() =>
      useEventBus<TestEventGroup>({ channelId: "channel1" })
    );

    // They should be the same dispatcher instance (shared via registry)
    const handler = vi.fn();
    result1.current.on("test:eventA", handler);
    result2.current.dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("should use default channel when no channelId is provided", () => {
    const { result: result1 } = renderHook(() => useEventBus<TestEventGroup>());
    const { result: result2 } = renderHook(() =>
      useEventBus<TestEventGroup>({ channelId: "default" })
    );

    const handler = vi.fn();
    result1.current.on("test:eventA", handler);
    result2.current.dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("should isolate events between different channels", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { result: result1 } = renderHook(() =>
      useEventBus<TestEventGroup>({ channelId: "channel1" })
    );
    const { result: result2 } = renderHook(() =>
      useEventBus<TestEventGroup>({ channelId: "channel2" })
    );

    result1.current.on("test:eventA", handler1);
    result2.current.on("test:eventA", handler2);

    result1.current.dispatch("test:eventA", { id: "1", name: "test1" });
    result2.current.dispatch("test:eventA", { id: "2", name: "test2" });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith({ id: "1", name: "test1" });
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith({ id: "2", name: "test2" });
  });

  test("should allow registering and dispatching events", () => {
    const handler = vi.fn();

    const { result } = renderHook(() => useEventBus<TestEventGroup>());

    result.current.on("test:eventA", handler);
    result.current.dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: "1", name: "test" });
  });

  test("should allow unregistering handlers", () => {
    const handler = vi.fn();

    const { result } = renderHook(() => useEventBus<TestEventGroup>());

    result.current.on("test:eventA", handler);
    result.current.off("test:eventA", handler);
    result.current.dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler).not.toHaveBeenCalled();
  });

  test("should handle events with no payload", () => {
    const handler = vi.fn();

    const { result } = renderHook(() => useEventBus<TestEventGroup>());

    result.current.on("test:eventC", handler);
    result.current.dispatch("test:eventC");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  test("should maintain same bus instance when channelId doesn't change", () => {
    const { result, rerender } = renderHook(
      ({ channelId }) => useEventBus<TestEventGroup>({ channelId }),
      {
        initialProps: { channelId: "channel1" },
      }
    );

    const handler = vi.fn();
    result.current.on("test:eventA", handler);

    // Rerender with same channelId
    rerender({ channelId: "channel1" });

    // Handler should still be registered
    result.current.dispatch("test:eventA", { id: "1", name: "test" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("should get new bus instance when channelId changes", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { result, rerender } = renderHook(
      ({ channelId }) => useEventBus<TestEventGroup>({ channelId }),
      {
        initialProps: { channelId: "channel1" },
      }
    );

    result.current.on("test:eventA", handler1);

    // Change channelId
    rerender({ channelId: "channel2" });

    // New channel should not have the handler
    result.current.on("test:eventA", handler2);
    result.current.dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test("should return bound methods that can be destructured", () => {
    const { result } = renderHook(() => useEventBus<TestEventGroup>());

    const { on, off, dispatch } = result.current;

    const handler = vi.fn();
    on("test:eventA", handler);
    dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler).toHaveBeenCalledTimes(1);

    off("test:eventA", handler);
    dispatch("test:eventA", { id: "2", name: "test2" });

    expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
  });
});
