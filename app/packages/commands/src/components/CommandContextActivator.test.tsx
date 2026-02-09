import React from "react";
import { render, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CommandContextActivator } from "./CommandContextActivator";
import { CommandContextManager } from "../context";

describe("CommandContextActivator", () => {
  const contextId = "test-activator-context";

  beforeEach(() => {
    const mgr = CommandContextManager.instance();
    // Ensure clean slate
    if (mgr.getCommandContext(contextId)) {
      mgr.deleteContext(contextId);
    }
  });

  afterEach(() => {
    cleanup();
    const mgr = CommandContextManager.instance();
    if (mgr.getCommandContext(contextId)) {
      mgr.deleteContext(contextId);
    }
  });

  it("should activate context on mount", () => {
    render(
      <CommandContextActivator id={contextId}>
        <div data-testid="child">Child</div>
      </CommandContextActivator>
    );

    const ctx = CommandContextManager.instance().getActiveContext();
    expect(ctx).toBeDefined();
    expect(ctx.id).toBe(contextId);
  });

  it("should deactivate context on unmount", () => {
    const { unmount } = render(
      <CommandContextActivator id={contextId}>
        <div data-testid="child">Child</div>
      </CommandContextActivator>
    );

    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      contextId
    );

    unmount();

    const active = CommandContextManager.instance().getActiveContext();
    // Should not be the test context
    if (active) {
      expect(active.id).not.toBe(contextId);
    }

    // Verify context is deleted
    expect(
      CommandContextManager.instance().getCommandContext(contextId)
    ).toBeUndefined();
  });

  it("should render children when context is ready", async () => {
    // Because of the async nature of useEffect in the hook,
    // passing children render check implies context was created.
    const { findByTestId } = render(
      <CommandContextActivator id={contextId}>
        <div data-testid="child">Child</div>
      </CommandContextActivator>
    );

    const child = await findByTestId("child");
    expect(child).toBeDefined();
  });

  it("should activate nested contexts in correct order", async () => {
    const parentId = "parent-context";
    const childId = "child-context";

    const { findByTestId } = render(
      <CommandContextActivator id={parentId}>
        <CommandContextActivator id={childId} inheritContext>
          <div data-testid="child">Child</div>
        </CommandContextActivator>
      </CommandContextActivator>
    );

    await findByTestId("child");

    const active = CommandContextManager.instance().getActiveContext();
    // If child activates AFTER parent, child should be on top.
    // If parent activates AFTER child (bottom-up effect without delay), parent would be on top.
    expect(active.id).toBe(childId);

    // Cleanup
    CommandContextManager.instance().deleteContext(parentId);
    CommandContextManager.instance().deleteContext(childId);
  });
});
