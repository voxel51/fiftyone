import { beforeEach, describe, expect, test, vi } from "vitest";
import { EventDispatcher } from "./dispatcher";

type TestEventGroup = {
  "test:eventA": { id: string; name: string };
  "test:eventB": { value: number };
  "test:eventC": undefined;
  "test:eventD": null;
};

describe("EventDispatcher", () => {
  let dispatcher: EventDispatcher<TestEventGroup>;

  beforeEach(() => {
    dispatcher = new EventDispatcher<TestEventGroup>();
  });

  describe("on", () => {
    test("should register a handler for an event", () => {
      const handler = vi.fn();
      dispatcher.on("test:eventA", handler);
      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ id: "1", name: "test" });
    });

    test("should register multiple handlers for the same event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      dispatcher.on("test:eventA", handler1);
      dispatcher.on("test:eventA", handler2);
      dispatcher.on("test:eventA", handler3);

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    test("should not register the same handler twice", () => {
      const handler = vi.fn();

      dispatcher.on("test:eventA", handler);
      dispatcher.on("test:eventA", handler);

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("should register handlers for events with no payload", () => {
      const handler = vi.fn();

      dispatcher.on("test:eventC", handler);
      dispatcher.dispatch("test:eventC");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(undefined);
    });

    test("should register handlers for events with null payload", () => {
      const handler = vi.fn();

      dispatcher.on("test:eventD", handler);
      dispatcher.dispatch("test:eventD", null);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(null);
    });
  });

  describe("off", () => {
    test("should unregister a specific handler", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      dispatcher.on("test:eventA", handler1);
      dispatcher.on("test:eventA", handler2);
      dispatcher.off("test:eventA", handler1);

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test("should do nothing if handler is not registered", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      dispatcher.on("test:eventA", handler1);
      dispatcher.off("test:eventA", handler2);

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
    });

    test("should do nothing if event has no handlers", () => {
      const handler = vi.fn();
      dispatcher.off("test:eventA", handler);
      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    test("should remove all handlers for an event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      dispatcher.on("test:eventA", handler1);
      dispatcher.on("test:eventA", handler2);
      dispatcher.on("test:eventA", handler3);

      dispatcher.clear("test:eventA");

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();
    });

    test("should only clear handlers for the specified event", () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      dispatcher.on("test:eventA", handlerA);
      dispatcher.on("test:eventB", handlerB);

      dispatcher.clear("test:eventA");

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });
      dispatcher.dispatch("test:eventB", { value: 42 });

      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalledTimes(1);
    });

    test("should allow registering new handlers after clear", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      dispatcher.on("test:eventA", handler1);
      dispatcher.clear("test:eventA");
      dispatcher.on("test:eventA", handler2);

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatch", () => {
    test("should call all registered handlers with the event data", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      dispatcher.on("test:eventA", handler1);
      dispatcher.on("test:eventA", handler2);
      dispatcher.on("test:eventA", handler3);

      const data = { id: "123", name: "test-name" };
      dispatcher.dispatch("test:eventA", data);

      expect(handler1).toHaveBeenCalledWith(data);
      expect(handler2).toHaveBeenCalledWith(data);
      expect(handler3).toHaveBeenCalledWith(data);
    });

    test("should do nothing if no handlers are registered", () => {
      expect(() => {
        dispatcher.dispatch("test:eventA", { id: "1", name: "test" });
      }).not.toThrow();
    });

    test("should handle events with no payload", () => {
      const handler = vi.fn();

      dispatcher.on("test:eventC", handler);
      dispatcher.dispatch("test:eventC");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(undefined);
    });

    test("should handle events with null payload", () => {
      const handler = vi.fn();

      dispatcher.on("test:eventD", handler);
      dispatcher.dispatch("test:eventD", null);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(null);
    });

    test("should handle synchronous handlers", () => {
      const handler = vi.fn(() => {
        // Synchronous handler
      });

      dispatcher.on("test:eventA", handler);
      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("should handle asynchronous handlers", async () => {
      vi.useFakeTimers();
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      dispatcher.on("test:eventA", handler);
      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      // Wait for async handler to complete
      await vi.runAllTimersAsync();

      expect(handler).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    test("should run multiple async handlers in parallel", async () => {
      vi.useFakeTimers();
      const callOrder: number[] = [];
      const handler1 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        callOrder.push(1);
      });
      const handler2 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push(2);
      });
      const handler3 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        callOrder.push(3);
      });

      dispatcher.on("test:eventA", handler1);
      dispatcher.on("test:eventA", handler2);
      dispatcher.on("test:eventA", handler3);

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      // Wait for all handlers to complete
      await vi.runAllTimersAsync();

      // All handlers should have been called
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);

      // Handler 3 should complete first, then 2, then 1 (parallel execution)
      expect(callOrder).toEqual([3, 2, 1]);
      vi.useRealTimers();
    });

    test("should handle errors in synchronous handlers gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const handler1 = vi.fn(() => {
        throw new Error("Handler 1 error");
      });
      const handler2 = vi.fn(() => {
        // Should still be called
      });

      dispatcher.on("test:eventA", handler1);
      dispatcher.on("test:eventA", handler2);

      expect(() => {
        dispatcher.dispatch("test:eventA", { id: "1", name: "test" });
      }).not.toThrow();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // Wait for async error logging to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test("should handle errors in asynchronous handlers gracefully", async () => {
      vi.useFakeTimers();
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const handler1 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("Handler 1 error");
      });
      const handler2 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        // Should still be called
      });

      dispatcher.on("test:eventA", handler1);
      dispatcher.on("test:eventA", handler2);

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      // Wait for handlers to complete
      await vi.runAllTimersAsync();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    });

    test("should not block dispatch when handlers throw errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const handler1 = vi.fn(() => {
        throw new Error("Handler error");
      });
      const handler2 = vi.fn(() => {
        throw new Error("Another handler error");
      });

      dispatcher.on("test:eventA", handler1);
      dispatcher.on("test:eventA", handler2);

      let dispatchCompleted = false;
      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });
      dispatchCompleted = true;

      expect(dispatchCompleted).toBe(true);
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // Wait for async error logging to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });

    test("should handle mixed sync and async handlers", async () => {
      vi.useFakeTimers();
      const syncHandler = vi.fn(() => {
        // Synchronous
      });
      const asyncHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      dispatcher.on("test:eventA", syncHandler);
      dispatcher.on("test:eventA", asyncHandler);

      dispatcher.dispatch("test:eventA", { id: "1", name: "test" });

      // Sync handler should be called immediately
      expect(syncHandler).toHaveBeenCalledTimes(1);

      // Wait for async handler
      await vi.runAllTimersAsync();
      expect(asyncHandler).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });
});
