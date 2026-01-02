/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CommandDispatcher } from "./dispatcher";
import { Command } from "../types";

// Test commands
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

class VoidCommand extends Command<void> {}

describe("CommandDispatcher", () => {
  let dispatcher: CommandDispatcher;

  beforeEach(() => {
    dispatcher = new CommandDispatcher();
  });

  it("should register and execute a command handler", async () => {
    dispatcher.register(TestCommand, async (cmd) => {
      return { value: cmd.input * 2 };
    });

    const result = await dispatcher.execute(new TestCommand(5));
    expect(result).toEqual({ value: 10 });
  });

  it("should throw error when registering duplicate handler", () => {
    dispatcher.register(TestCommand, async (cmd) => {
      return { value: cmd.input };
    });

    expect(() => {
      dispatcher.register(TestCommand, async (cmd) => {
        return { value: cmd.input * 2 };
      });
    }).toThrow("Handler already registered for TestCommand");
  });

  it("should throw error when executing unregistered command", async () => {
    await expect(dispatcher.execute(new TestCommand(5))).rejects.toThrow(
      "No handler registered for TestCommand"
    );
  });

  it("should handle multiple different command types", async () => {
    dispatcher.register(TestCommand, async (cmd) => {
      return { value: cmd.input * 2 };
    });

    dispatcher.register(AnotherCommand, async (cmd) => {
      return cmd.text.toUpperCase();
    });

    const result1 = await dispatcher.execute(new TestCommand(3));
    const result2 = await dispatcher.execute(new AnotherCommand("hello"));

    expect(result1).toEqual({ value: 6 });
    expect(result2).toBe("HELLO");
  });

  it("should handle commands with void return type", async () => {
    let executed = false;
    dispatcher.register(VoidCommand, async () => {
      executed = true;
    });

    const result = await dispatcher.execute(new VoidCommand());
    expect(result).toBeUndefined();
    expect(executed).toBe(true);
  });

  it("should propagate errors from handlers", async () => {
    dispatcher.register(TestCommand, async () => {
      throw new Error("Handler error");
    });

    await expect(dispatcher.execute(new TestCommand(5))).rejects.toThrow(
      "Handler error"
    );
  });

  it("should unregister a handler and reject execution", async () => {
    dispatcher.register(TestCommand, async (cmd) => {
      return { value: cmd.input * 2 };
    });

    const result = await dispatcher.execute(new TestCommand(5));
    expect(result).toEqual({ value: 10 });

    dispatcher.unregister(TestCommand);

    await expect(dispatcher.execute(new TestCommand(5))).rejects.toThrow(
      "No handler registered for TestCommand"
    );
  });
});
