import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useCommandContext } from "./useCommandContext";
import { CommandContextManager } from "../context";

describe("useCommandContext", () => {
  beforeEach(() => {
    // Clear contexts before each test
    // We might need to mock or reset the singleton instance if no clear method exists
    // Assuming we can just access the instance
  });

  it("should create and register a context on mount", () => {
    const contextId = "test-context";
    const { result } = renderHook(() => useCommandContext(contextId));

    expect(result.current.context).toBeDefined();
    expect(result.current.context?.id).toBe(contextId);
    expect(
      CommandContextManager.instance().getCommandContext(contextId)
    ).toBeDefined();
  });

  it("should remove the context on unmount", () => {
    const contextId = "test-context-unmount";
    const { unmount } = renderHook(() => useCommandContext(contextId));

    expect(
      CommandContextManager.instance().getCommandContext(contextId)
    ).toBeDefined();

    unmount();

    expect(
      CommandContextManager.instance().getCommandContext(contextId)
    ).toBeUndefined();
  });

  it("should activate and deactivate the context", () => {
    const contextId = "test-context-active";
    const { result } = renderHook(() => useCommandContext(contextId));

    act(() => {
      result.current.activate();
    });

    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      contextId
    );

    act(() => {
      result.current.deactivate();
    });

    // Depending on previous state, it might pop back to default or undefined
    // We should check that it's NOT the test context anymore, or check stack depth
    expect(CommandContextManager.instance().getActiveContext().id).not.toBe(
      contextId
    );
  });
});
