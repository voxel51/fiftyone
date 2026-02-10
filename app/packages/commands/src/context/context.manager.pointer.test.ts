import { describe, it, expect, beforeEach } from "vitest";
import { CommandContextManager, KnownContexts } from "./CommandContextManager";

describe("CommandContextManager (Single Pointer)", () => {
  beforeEach(() => {
    CommandContextManager.instance().reset();
  });

  it("handles simple hierarchical activation", () => {
    const mgr = CommandContextManager.instance();
    const modal = mgr.createCommandContext(
      "modal",
      KnownContexts.Default,
      true
    );
    const annotate = mgr.createCommandContext("annotate", "modal", true);

    mgr.activateContext("modal");
    expect(mgr.getActiveContext().id).toBe("modal");

    mgr.activateContext("annotate");
    expect(mgr.getActiveContext().id).toBe("annotate");

    mgr.deactivateContext("annotate");
    expect(mgr.getActiveContext().id).toBe("modal");

    mgr.deactivateContext("modal");
    expect(mgr.getActiveContext().id).toBe(KnownContexts.Default);
  });

  it("implements child-wins logic (parent pushed after child)", () => {
    const mgr = CommandContextManager.instance();
    mgr.createCommandContext("parent", KnownContexts.Default, true);
    mgr.createCommandContext("child", "parent", true);

    // Child mounts/activates first (common in React side-effects)
    mgr.activateContext("child");
    expect(mgr.getActiveContext().id).toBe("child");

    // Parent mounts/activates after. It should NOT steal focus from its child.
    mgr.activateContext("parent");
    expect(mgr.getActiveContext().id).toBe("child");
  });

  it("enforces LIFO popping (throws if popping non-active)", () => {
    const mgr = CommandContextManager.instance();
    mgr.createCommandContext("parent", KnownContexts.Default, true);
    mgr.createCommandContext("child", "parent", true);

    mgr.activateContext("parent");
    mgr.activateContext("child");

    // Trying to pop parent while child is active should throw
    expect(() => mgr.deactivateContext("parent")).toThrow();
  });

  it("activation is idempotent", () => {
    const mgr = CommandContextManager.instance();
    mgr.createCommandContext("modal", KnownContexts.Default, true);

    mgr.activateContext("modal");
    expect(mgr.getActiveContext().id).toBe("modal");

    // Activate again
    mgr.activateContext("modal");
    expect(mgr.getActiveContext().id).toBe("modal");

    mgr.deactivateContext("modal");
    expect(mgr.getActiveContext().id).toBe(KnownContexts.Default);
  });
});
