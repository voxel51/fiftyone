/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandRegistry } from "./CommandRegistry";
import { ActionManager } from "../actions";

describe("CommandRegistry", () => {
  let registry: CommandRegistry;
  const cmdOne = "fo.test.command";
  const cmdTwo = "fo.test.command2";
  beforeEach(() => {
    registry = new CommandRegistry(new ActionManager());
  });

  it("can register commands", () => {
    let command = registry.registerCommand(
      cmdOne,
      () => {
        return;
      },
      () => {
        return true;
      }
    );
    expect(command).toBeDefined();
    command = registry.registerCommand(
      cmdTwo,
      () => {
        return;
      },
      () => {
        return true;
      },
      "fo",
      "test fo command"
    );
    expect(command.isEnabled()).toBe(true);
    expect(registry.getCommand(cmdOne)).toBeDefined();
    expect(registry.getCommand(cmdTwo)).toBeDefined();
  });

  it("can unregister commands", () => {
    let command = registry.registerCommand(
      cmdOne,
      () => {
        return;
      },
      () => {
        return true;
      }
    );
    expect(command).toBeDefined();
    command = registry.registerCommand(
      cmdTwo,
      () => {
        return;
      },
      () => {
        return true;
      },
      "fo",
      "test fo command"
    );
    expect(command).toBeDefined();

    expect(registry.getCommand(cmdOne)).toBeDefined();
    expect(registry.getCommand(cmdTwo)).toBeDefined();

    registry.unregisterCommand(cmdOne);
    expect(registry.getCommand(cmdOne)).toBeUndefined();

    registry.unregisterCommand(cmdTwo);
    expect(registry.getCommand(cmdTwo)).toBeUndefined();
  });

  it("can execute a registered command", async () => {
    const testFunc = vi.fn(() => {
      return;
    });

    registry.registerCommand(
      cmdOne,
      () => {
        testFunc();
      },
      () => {
        return true;
      },
      "fo",
      "test fo command"
    );
    expect(registry.getCommand(cmdOne)).toBeDefined();
    expect(await registry.executeCommand(cmdOne)).toEqual(true);
    expect(testFunc).toBeCalledTimes(1);
  });
  it("does not execute a registered command that is disabled", async () => {
    const testFunc = vi.fn(() => {
      return;
    });

    registry.registerCommand(
      cmdOne,
      () => {
        testFunc();
      },
      () => {
        return false;
      },
      "fo",
      "test fo command"
    );
    expect(registry.getCommand(cmdOne)).toBeDefined();
    expect(await registry.executeCommand(cmdOne)).toEqual(false);
    expect(testFunc).toBeCalledTimes(0);
  });

  it("can properly invoke and unregister listeners", () => {
    const listener = vi.fn(() => {
      return;
    });
    registry.addListener(listener);
    registry.registerCommand(
      cmdOne,
      () => {
        return;
      },
      () => {
        return false;
      },
      "fo",
      "test fo command"
    );
    //ensure listeners fire on register/unregister
    expect(listener).toBeCalledTimes(1);
    registry.unregisterCommand(cmdOne);
    expect(listener).toBeCalledTimes(2);
    registry.removeListener(listener);
    registry.registerCommand(
      cmdOne,
      () => {
        return;
      },
      () => {
        return false;
      },
      "fo",
      "test fo command"
    );
    expect(listener).toBeCalledTimes(2);
    registry.unregisterCommand(cmdOne);
    expect(listener).toBeCalledTimes(2);
  });
});
