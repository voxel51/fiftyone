import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCommand } from "./useCommand";
import { CommandContextManager } from "../context";

describe("useCommand", () => {
  const contextId = "test-use-command-context";
  const commandId = "test.command";
  const label = "Test Command";
  const description = "Test Description";

  beforeEach(() => {
    const mgr = CommandContextManager.instance();
    // Ensure clean state
    if (mgr.getCommandContext(contextId)) {
      mgr.deleteContext(contextId);
    }
    const ctx = mgr.createCommandContext(contextId, false);
    ctx.registerCommand(
      commandId,
      async () => {},
      () => true,
      label,
      description
    );
  });

  afterEach(() => {
    const mgr = CommandContextManager.instance();
    if (mgr.getCommandContext(contextId)) {
      mgr.deleteContext(contextId);
    }
  });

  it("should retrieve an existing command", () => {
    const mgr = CommandContextManager.instance();
    const ctx = mgr.getCommandContext(contextId)!;

    // Ensure command exists
    expect(ctx.getCommand(commandId)).toBeDefined();

    const { result } = renderHook(() => useCommand(commandId, contextId));

    expect(result.current.descriptor.id).toBe(commandId);
    expect(result.current.descriptor.label).toBe(label);
    expect(result.current.descriptor.description).toBe(description);
    expect(result.current.enabled).toBe(true);
  });

  it("should execute the command", async () => {
    const mgr = CommandContextManager.instance();
    const ctx = mgr.getCommandContext(contextId)!;
    const handler = vi.fn();

    ctx.unregisterCommand(commandId);
    ctx.registerCommand(commandId, handler, () => true);

    const { result } = renderHook(() => useCommand(commandId, contextId));

    await act(async () => {
      await result.current.callback();
    });

    expect(handler).toHaveBeenCalled();
  });

  it("should update when command enablement changes", async () => {
    const mgr = CommandContextManager.instance();
    const ctx = mgr.getCommandContext(contextId)!;

    // Setup command with variable enablement
    let isEnabled = true;
    ctx.unregisterCommand(commandId);
    ctx.registerCommand(
      commandId,
      async () => {},
      () => isEnabled
    );

    const { result } = renderHook(() => useCommand(commandId, contextId));

    expect(result.current.enabled).toBe(true);

    // Change enablement
    isEnabled = false;

    // Manually trigger a refresh or mock the event if possible.
    // The hook subscribes to the command.
    // We need to trigger a check or rely on the hook's subscription.
    // The hook subscribes to command updates, so we need to trigger an update.
    // Ideally registerCommand / execution triggers updates or use some internal mechanism.
    // Looking at Command implementation might be needed to see how to trigger update.
    // Assuming re-registering or some other mechanism triggers it.
    // Or simply changing the context.

    // Actually, command.subscribe calls back when updated?
    // Let's force update via context if possible or just use what we have.
    // command.subscribe is used in useCommand. However, Command class might not expose a "triggerUpdate" method easily.
    // Let's try re-registering: that will create a NEW command instance, but useCommand uses boundContext.getCommand
    // AND subscribes to boundContext.subscribeCommands. So re-registering should work.

    act(() => {
      ctx.unregisterCommand(commandId);
      ctx.registerCommand(
        commandId,
        async () => {},
        () => false
      );
    });

    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
    });
  });

  it("should handle missing context gracefully", () => {
    const missingContextId = "missing-context";
    const { result } = renderHook(() =>
      useCommand(commandId, missingContextId)
    );

    // It should probably return empty/false values
    expect(result.current.enabled).toBe(false);
    expect(result.current.descriptor.label).toBe("");
  });
});
