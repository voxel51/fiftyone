import { render, cleanup, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useKeyBindings } from "./useKeyBindings";
import { CommandContextActivator } from "../components/CommandContextActivator";
import { CommandContextManager, KnownContexts } from "../context";

// Mock component that uses useKeyBindings
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TestComponent = ({
  contextId,
  handler,
  dummy,
  bindings,
}: {
  contextId: string;
  handler: () => void;
  dummy?: number;
  bindings?: any[];
}) => {
  useKeyBindings(
    contextId,
    bindings || [
      {
        sequence: "ctrl+k",
        command: {
          commandId: "test.command",
          handler: handler,
          label: "Test Command",
        },
      },
    ]
  );
  return <div>Test Component</div>;
};

describe("useKeyBindings Integration", () => {
  const contextId = "test-integration-context";

  beforeEach(() => {
    CommandContextManager.instance().reset();
  });
  it("should register and execute command on key press", async () => {
    const handler = vi.fn();

    render(
      <CommandContextActivator id={contextId} parent={KnownContexts.Default}>
        <TestComponent contextId={contextId} handler={handler} />
      </CommandContextActivator>
    );

    // Wait for effect to register bindings (implicit in render usually, but good to be safe)

    // Context should be active
    const ctx = CommandContextManager.instance().getActiveContext();
    expect(ctx.id).toBe(contextId);

    // Simulate key press
    // We might need to dispatch to window or use KeyManager directly if it listens to window
    // Assuming KeyManager listens to window keydown

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });

    // Check if handler was called
    expect(handler).toHaveBeenCalled();
  });

  it("should maintain functionality after re-render", async () => {
    const handler = vi.fn();

    const { rerender } = render(
      <CommandContextActivator id={contextId} parent={KnownContexts.Default}>
        <TestComponent contextId={contextId} handler={handler} dummy={1} />
      </CommandContextActivator>
    );

    // Verify initial working state
    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // Rerender with same props to simulate update
    rerender(
      <CommandContextActivator id={contextId} parent={KnownContexts.Default}>
        <TestComponent contextId={contextId} handler={handler} dummy={2} />
      </CommandContextActivator>
    );

    // Verify working state after re-render
    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should remove bindings on unmount", async () => {
    const handler = vi.fn();

    const { unmount } = render(
      <CommandContextActivator id={contextId} parent={KnownContexts.Default}>
        <TestComponent contextId={contextId} handler={handler} />
      </CommandContextActivator>
    );

    // Verify initial working state
    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // Unmount
    unmount();

    // Verify handler is NOT called after unmount
    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });
    expect(handler).toHaveBeenCalledTimes(1); // Should remain 1
  });

  it("should unregister commands on unmount", async () => {
    const commandId = "test-command-removal";
    const handler = vi.fn();

    const { unmount } = render(
      <CommandContextActivator id={contextId} parent={KnownContexts.Default}>
        <TestComponent
          contextId={contextId}
          bindings={[
            {
              sequence: "ctrl+m",
              command: {
                commandId,
                handler,
                label: "Test Remove",
              },
            },
          ]}
          handler={function (): void {
            throw new Error("Function not implemented.");
          }}
        />
      </CommandContextActivator>
    );

    const ctx = CommandContextManager.instance().getCommandContext(contextId);
    await waitFor(() => {
      expect(ctx?.getCommand(commandId)).toBeDefined();
    });

    unmount();

    expect(ctx?.getCommand(commandId)).toBeUndefined();
  });
});
