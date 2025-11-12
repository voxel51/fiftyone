import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createUseEventHandler } from "./createUseEventHandler";
import { useEventBus } from "./useEventBus";

type TestEventGroup = {
  "test:eventA": { id: string; name: string };
  "test:eventB": { value: number };
  "test:eventC": undefined;
};

describe("createUseEventHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should create a hook that registers handlers", () => {
    const useTestEventHandler = createUseEventHandler<TestEventGroup>();
    const handler = vi.fn();

    renderHook(() => {
      useTestEventHandler("test:eventA", handler);
    });

    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    busResult.current.dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: "1", name: "test" });
  });

  test("should unregister handlers on unmount", () => {
    const useTestEventHandler = createUseEventHandler<TestEventGroup>();
    const handler = vi.fn();

    const { unmount } = renderHook(() => {
      useTestEventHandler("test:eventA", handler);
    });

    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    // Handler should be registered
    busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();

    busResult.current.dispatch("test:eventA", { id: "2", name: "test2" });
    expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
  });

  test("should re-register handler when event changes", () => {
    const useTestEventHandler = createUseEventHandler<TestEventGroup>();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { rerender } = renderHook(
      ({ event }) => {
        if (event === "test:eventA") {
          useTestEventHandler("test:eventA", handlerA);
        } else {
          useTestEventHandler("test:eventB", handlerB);
        }
      },
      {
        initialProps: { event: "test:eventA" as keyof TestEventGroup },
      }
    );

    // Initially handlerA should be registered
    busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).not.toHaveBeenCalled();

    rerender({ event: "test:eventB" });

    // handlerA should be unregistered, handlerB should be registered
    busResult.current.dispatch("test:eventA", { id: "2", name: "test2" });
    busResult.current.dispatch("test:eventB", { value: 42 });

    // Still 1
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  test("should re-register handler when handler function changes", () => {
    const useTestEventHandler = createUseEventHandler<TestEventGroup>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { rerender } = renderHook(
      ({ handler }) => {
        useTestEventHandler("test:eventA", handler);
      },
      {
        initialProps: { handler: handler1 },
      }
    );

    // Initially handler1 should be registered
    busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();

    // Change handler
    rerender({ handler: handler2 });

    // handler1 should be unregistered, handler2 should be registered
    busResult.current.dispatch("test:eventA", { id: "2", name: "test2" });

    expect(handler1).toHaveBeenCalledTimes(1); // Still 1
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test("should handle events with no payload", () => {
    const useTestEventHandler = createUseEventHandler<TestEventGroup>();
    const handler = vi.fn();

    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    renderHook(() => {
      useTestEventHandler("test:eventC", handler);
    });

    busResult.current.dispatch("test:eventC");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  test("should use shared event bus", () => {
    const useTestEventHandler = createUseEventHandler<TestEventGroup>();
    const handler = vi.fn();

    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    renderHook(() => {
      useTestEventHandler("test:eventA", handler);
    });

    busResult.current.dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("should handle multiple handlers for the same event", () => {
    const useTestEventHandler = createUseEventHandler<TestEventGroup>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    renderHook(() => {
      useTestEventHandler("test:eventA", handler1);
      useTestEventHandler("test:eventA", handler2);
    });

    busResult.current.dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test("should handle async handlers", async () => {
    const useTestEventHandler = createUseEventHandler<TestEventGroup>();
    const handler = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    renderHook(() => {
      useTestEventHandler("test:eventA", handler);
    });

    busResult.current.dispatch("test:eventA", { id: "1", name: "test" });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  test("should not re-register when dependencies don't change", () => {
    const useTestEventHandler = createUseEventHandler<TestEventGroup>();
    const handler = vi.fn();

    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { rerender } = renderHook(() => {
      useTestEventHandler("test:eventA", handler);
    });

    busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    expect(handler).toHaveBeenCalledTimes(1);

    // Rerender without changing dependencies
    rerender();

    // Handler should still be registered (not unregistered and re-registered)
    busResult.current.dispatch("test:eventA", { id: "2", name: "test2" });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
