/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCommandBus } from "../dispatch";
import { Command, CommandCtor } from "../types";
import { useRegisterCommandHandler } from "./useRegisterCommandHandler";

class TestCommand extends Command<{ value: number }> {
  constructor(public readonly input: number) {
    super();
  }
}

class AnotherCommand extends Command<string> {
  constructor(public readonly text: string) {
    super();
  }
}

describe("useRegisterCommandHandler", () => {
  beforeEach(() => {
    const bus = getCommandBus();

    try {
      bus.unregister(TestCommand);
    } catch {}
    try {
      bus.unregister(AnotherCommand);
    } catch {}
    vi.clearAllMocks();
  });

  afterEach(() => {
    const bus = getCommandBus();
    try {
      bus.unregister(TestCommand);
    } catch {}
    try {
      bus.unregister(AnotherCommand);
    } catch {}
  });

  it("should register a handler on mount", async () => {
    const handler = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input * 2 };
    });

    renderHook(() => {
      useRegisterCommandHandler(TestCommand, handler);
    });

    const bus = getCommandBus();
    const result = await bus.execute(new TestCommand(5));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.any(TestCommand));
    expect(result).toEqual({ value: 10 });
  });

  it("should unregister handler on unmount", async () => {
    const handler = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input };
    });

    const { unmount } = renderHook(() => {
      useRegisterCommandHandler(TestCommand, handler);
    });

    const bus = getCommandBus();
    await bus.execute(new TestCommand(5));
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();

    // Handler should be unregistered, so execution should fail
    await expect(bus.execute(new TestCommand(5))).rejects.toThrow(
      "No handler registered for TestCommand"
    );
  });

  it("should re-register when handler changes (same type)", async () => {
    const handler1 = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input * 2 };
    });

    const handler2 = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input * 3 };
    });

    const { rerender } = renderHook(
      ({ handler }) => {
        useRegisterCommandHandler(TestCommand, handler);
      },
      {
        initialProps: { handler: handler1 },
      }
    );

    const bus = getCommandBus();
    let result = await bus.execute(new TestCommand(5));
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();
    expect(result).toEqual({ value: 10 });

    rerender({ handler: handler2 });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    result = await bus.execute(new TestCommand(5));
    // Still 1, not called again
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ value: 15 });
  });

  it("should re-register when type changes", async () => {
    const handler1 = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input * 2 };
    });

    const handler2 = vi.fn(async (cmd: AnotherCommand) => {
      return cmd.text.toUpperCase();
    });

    const { rerender } = renderHook(
      ({
        type,
        handler,
      }: {
        type: CommandCtor<TestCommand> | CommandCtor<AnotherCommand>;
        handler: any;
      }) => {
        useRegisterCommandHandler(type as any, handler);
      },
      {
        initialProps: { type: TestCommand, handler: handler1 },
      }
    );

    const bus = getCommandBus();
    let result = await bus.execute(new TestCommand(5));
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ value: 10 });

    rerender({ type: AnotherCommand, handler: handler2 });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Old handler should be unregistered
    await expect(bus.execute(new TestCommand(5))).rejects.toThrow(
      "No handler registered for TestCommand"
    );

    // New handler should work
    const result2 = await bus.execute(new AnotherCommand("hello"));
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(result2).toBe("HELLO");
  });

  it("should re-register when both type and handler change", async () => {
    const handler1 = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input * 2 };
    });

    const handler2 = vi.fn(async (cmd: AnotherCommand) => {
      return cmd.text.toLowerCase();
    });

    const { rerender } = renderHook(
      ({
        type,
        handler,
      }: {
        type: CommandCtor<TestCommand> | CommandCtor<AnotherCommand>;
        handler: any;
      }) => {
        useRegisterCommandHandler(type as any, handler);
      },
      {
        initialProps: { type: TestCommand, handler: handler1 },
      }
    );

    const bus = getCommandBus();
    await bus.execute(new TestCommand(5));
    expect(handler1).toHaveBeenCalledTimes(1);

    // Change both type and handler
    rerender({ type: AnotherCommand, handler: handler2 });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await expect(bus.execute(new TestCommand(5))).rejects.toThrow(
      "No handler registered for TestCommand"
    );

    const result = await bus.execute(new AnotherCommand("HELLO"));
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(result).toBe("hello");
  });

  it("should handle registration errors gracefully", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const handler1 = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input };
    });

    const handler2 = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input * 2 };
    });

    // Manually register a handler to cause a conflict
    const bus = getCommandBus();
    bus.register(TestCommand, handler1);

    // Try to register via hook - should catch error
    renderHook(() => {
      useRegisterCommandHandler(TestCommand, handler2);
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to register handler for TestCommand"),
      expect.any(Error)
    );

    await expect(bus.execute(new TestCommand(5))).resolves.toEqual({
      value: 5,
    });

    consoleErrorSpy.mockRestore();
  });

  it("should not re-register if handler reference is the same", async () => {
    const handler = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input * 2 };
    });

    const { rerender } = renderHook(
      ({ handler }) => {
        useRegisterCommandHandler(TestCommand, handler);
      },
      {
        initialProps: { handler },
      }
    );

    const bus = getCommandBus();
    await bus.execute(new TestCommand(5));
    expect(handler).toHaveBeenCalledTimes(1);

    rerender({ handler });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await bus.execute(new TestCommand(3));
    // Called twice from execution, not from re-registration
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should handle multiple hooks registering different command types", async () => {
    const handler1 = vi.fn(async (cmd: TestCommand) => {
      return { value: cmd.input * 2 };
    });

    const handler2 = vi.fn(async (cmd: AnotherCommand) => {
      return cmd.text.toUpperCase();
    });

    renderHook(() => {
      useRegisterCommandHandler(TestCommand, handler1);
      useRegisterCommandHandler(AnotherCommand, handler2);
    });

    const bus = getCommandBus();
    const result1 = await bus.execute(new TestCommand(5));
    const result2 = await bus.execute(new AnotherCommand("hello"));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(result1).toEqual({ value: 10 });
    expect(result2).toBe("HELLO");
  });

  it("should maintain handler closure with latest values", async () => {
    let multiplier = 2;

    const createHandler = () => {
      return vi.fn(async (cmd: TestCommand) => {
        return { value: cmd.input * multiplier };
      });
    };

    const { rerender } = renderHook(
      ({ handler }) => {
        useRegisterCommandHandler(TestCommand, handler);
      },
      {
        initialProps: { handler: createHandler() },
      }
    );

    const bus = getCommandBus();
    let result = await bus.execute(new TestCommand(5));
    expect(result).toEqual({ value: 10 });

    multiplier = 3;
    rerender({ handler: createHandler() });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    result = await bus.execute(new TestCommand(5));
    expect(result).toEqual({ value: 15 });
  });
});
