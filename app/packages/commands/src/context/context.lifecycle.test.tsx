import { render, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CommandContextManager, KnownContexts } from "./";
import { useCommandContext } from "../hooks/useCommandContext";
import { CommandContextActivator } from "../components/CommandContextActivator";

describe("CommandContext Lifecycle Verification", () => {
  const mgr = CommandContextManager.instance();

  beforeEach(() => {
    mgr.reset();
  });

  afterEach(() => {
    cleanup();
    mgr.reset();
  });

  it("should create context on mount and delete on unmount", () => {
    const TestComponent = ({ id }: { id: string }) => {
      useCommandContext(id);
      return null;
    };

    const contextId = "lifecycle-test-1";
    const { unmount } = render(<TestComponent id={contextId} />);

    expect(mgr.getCommandContext(contextId)).toBeDefined();

    unmount();

    expect(mgr.getCommandContext(contextId)).toBeUndefined();
  });

  it("should handle StrictMode-like behavior (mount -> unmount -> mount)", () => {
    const contextId = "lifecycle-strict-mode";

    const TestComponent = () => {
      useCommandContext(contextId);
      return null;
    };

    const { unmount } = render(<TestComponent />);

    // First mount
    expect(mgr.getCommandContext(contextId)).toBeDefined();
    const ctx1 = mgr.getCommandContext(contextId);

    // Simulate unmount (cleanup runs)
    unmount();
    expect(mgr.getCommandContext(contextId)).toBeUndefined();

    // Simulate remount
    render(<TestComponent />);
    expect(mgr.getCommandContext(contextId)).toBeDefined();
    const ctx2 = mgr.getCommandContext(contextId);

    // Should be a new instance if it was deleted
    expect(ctx1).not.toBe(ctx2);
  });

  it("should activate on mount and deactivate on unmount via Activator", () => {
    const contextId = "activator-lifecycle";

    const { unmount } = render(
      <CommandContextActivator id={contextId}>
        <div>Child</div>
      </CommandContextActivator>
    );

    expect(mgr.getActiveContext().id).toBe(contextId);

    unmount();

    expect(mgr.getActiveContext().id).toBe(KnownContexts.Default);
    expect(mgr.getCommandContext(contextId)).toBeUndefined();
  });

  it("should maintain parent-child active state correctly during nested unmounts", () => {
    const parentId = "parent-lifecycle";
    const childId = "child-lifecycle";

    const { unmount } = render(
      <CommandContextActivator id={parentId}>
        <div data-testid="parent">
          <CommandContextActivator id={childId}>
            <div data-testid="child">Child</div>
          </CommandContextActivator>
        </div>
      </CommandContextActivator>
    );

    // Child should be active (child-wins)
    expect(mgr.getActiveContext().id).toBe(childId);
    expect(mgr.getCommandContext(childId)?.getParent()?.id).toBe(parentId);

    // Unmount
    unmount();

    // Should be back to default
    expect(mgr.getActiveContext().id).toBe(KnownContexts.Default);
    expect(mgr.getCommandContext(parentId)).toBeUndefined();
    expect(mgr.getCommandContext(childId)).toBeUndefined();
  });

  it("should handle unmount of active context correctly (fall back to parent)", () => {
    const parentId = "parent-fallback";
    const childId = "child-active";

    // Setup: Parent active, then Child active
    mgr.createCommandContext(parentId, KnownContexts.Default, true);
    mgr.activateContext(parentId);

    mgr.createCommandContext(childId, parentId, true);
    mgr.activateContext(childId);

    expect(mgr.getActiveContext().id).toBe(childId);

    // Manually delete active child (simulating component unmount logic)
    mgr.deactivateContext(childId);
    mgr.deleteContext(childId);

    expect(mgr.getActiveContext().id).toBe(parentId);

    // Cleanup parent
    mgr.deactivateContext(parentId);
    mgr.deleteContext(parentId);

    expect(mgr.getActiveContext().id).toBe(KnownContexts.Default);
  });

  it("should robustly handle attempting to activate a deleted context", () => {
    const id = "zombie-context";
    mgr.createCommandContext(id, KnownContexts.Default, false);

    mgr.deleteContext(id);

    expect(() => mgr.activateContext(id)).toThrow();
    // Should not have changed active context
    expect(mgr.getActiveContext().id).toBe(KnownContexts.Default);
  });
});
