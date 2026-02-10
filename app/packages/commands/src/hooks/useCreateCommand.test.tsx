import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCreateCommand } from "./useCreateCommand";
import { CommandContextManager, KnownContexts } from "../context";

describe("useCreateCommand", () => {
  const contextId = "test-create-command-context";
  const commandId = "test.create.command";
  const label = "Test Create Command";
  const description = "Test Description";

  beforeEach(() => {
    CommandContextManager.instance().reset();
    CommandContextManager.instance().createCommandContext(
      contextId,
      KnownContexts.Default,
      false
    );
  });

  it("should register a command in the specified context", () => {
    const execFn = vi.fn();
    const enablement = () => true;

    const { result } = renderHook(() =>
      useCreateCommand(
        contextId,
        commandId,
        execFn,
        enablement,
        label,
        description
      )
    );

    const mgr = CommandContextManager.instance();
    const ctx = mgr.getCommandContext(contextId)!;
    const cmd = ctx.getCommand(commandId);

    expect(cmd).toBeDefined();
    expect(cmd?.label).toBe(label);
    expect(result.current.enabled).toBe(true);
  });

  it("should unregister the command on unmount", () => {
    const execFn = vi.fn();
    const enablement = () => true;

    const { unmount } = renderHook(() =>
      useCreateCommand(
        contextId,
        commandId,
        execFn,
        enablement,
        label,
        description
      )
    );

    const mgr = CommandContextManager.instance();
    const ctx = mgr.getCommandContext(contextId)!;

    expect(ctx.getCommand(commandId)).toBeDefined();

    unmount();

    expect(ctx.getCommand(commandId)).toBeUndefined();
  });

  it("should update enablement", async () => {
    const execFn = vi.fn();
    // Use a mutable object to simulate external state change or just re-render with new enablement function?
    // useCreateCommand takes `enablement` function. If function changes, effect re-runs.

    let isEnabled = true;
    const enablement = () => isEnabled;

    const { result, rerender } = renderHook(
      ({ en }) =>
        useCreateCommand(contextId, commandId, execFn, en, label, description),
      {
        initialProps: { en: enablement },
      }
    );

    expect(result.current.enabled).toBe(true);

    // Update enablement
    isEnabled = false;
    // Rerender to trigger effect update
    rerender({ en: () => isEnabled });

    expect(result.current.enabled).toBe(false);
  });

  it("should execute the command callback", async () => {
    const execFn = vi.fn();
    const enablement = () => true;

    const { result } = renderHook(() =>
      useCreateCommand(
        contextId,
        commandId,
        execFn,
        enablement,
        label,
        description
      )
    );

    await act(async () => {
      await result.current.callback();
    });

    expect(execFn).toHaveBeenCalled();
  });
});
