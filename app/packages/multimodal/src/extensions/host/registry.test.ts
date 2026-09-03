import { describe, expect, it } from "vitest";
import { createExtensionRegistry } from "./registry";

interface Probe {
  readonly id: string;
  readonly order: number;
  readonly tag?: string;
}

/** A fresh global slot per case, so registries can't leak into each other. */
let slotSeq = 0;
const freshRegistry = (
  options?: Parameters<typeof createExtensionRegistry>[2],
) =>
  createExtensionRegistry<Probe>(
    Symbol(`test-slot-${(slotSeq += 1)}`),
    "probe",
    options,
  );

describe("createExtensionRegistry", () => {
  it("sorts by order, then id, regardless of registration order", () => {
    const registry = freshRegistry();
    registry.register({ id: "b:late", order: 9 });
    registry.register({ id: "z:first", order: 1 });
    registry.register({ id: "a:first", order: 1 });

    expect(registry.getSnapshot().map(({ id }) => id)).toEqual([
      "a:first",
      "z:first",
      "b:late",
    ]);
  });

  it("treats re-registering the same object as a no-op", () => {
    const registry = freshRegistry();
    const probe: Probe = { id: "a:one", order: 1 };
    registry.register(probe);

    expect(() => registry.register(probe)).not.toThrow();
    expect(registry.getSnapshot()).toHaveLength(1);
  });

  describe("by default", () => {
    it("throws when a different object claims a registered id", () => {
      const registry = freshRegistry();
      registry.register({ id: "a:one", order: 1 });

      expect(() => registry.register({ id: "a:one", order: 1 })).toThrow(
        "Duplicate probe id: a:one",
      );
    });
  });

  describe('with duplicateIdPolicy "replace"', () => {
    it("lets the newcomer win instead of throwing", () => {
      const registry = freshRegistry({ duplicateIdPolicy: "replace" });
      registry.register({ id: "a:one", order: 1, tag: "old" });
      registry.register({ id: "a:one", order: 1, tag: "new" });

      expect(registry.getSnapshot()).toHaveLength(1);
      expect(registry.get("a:one")?.tag).toBe("new");
    });

    it("re-sorts on replacement, so order still decides placement", () => {
      const registry = freshRegistry({ duplicateIdPolicy: "replace" });
      registry.register({ id: "a:one", order: 1 });
      registry.register({ id: "b:two", order: 2 });
      registry.register({ id: "a:one", order: 3 });

      expect(registry.getSnapshot().map(({ id }) => id)).toEqual([
        "b:two",
        "a:one",
      ]);
    });

    it("keeps a superseded registration's cleanup from clearing the replacement", () => {
      const registry = freshRegistry({ duplicateIdPolicy: "replace" });
      const unregister = registry.register({
        id: "a:one",
        order: 1,
        tag: "old",
      });
      registry.register({ id: "a:one", order: 1, tag: "new" });

      unregister();

      expect(registry.get("a:one")?.tag).toBe("new");
    });

    it("notifies subscribers on replacement", () => {
      const registry = freshRegistry({ duplicateIdPolicy: "replace" });
      registry.register({ id: "a:one", order: 1, tag: "old" });
      let notified = 0;
      registry.subscribe(() => {
        notified += 1;
      });

      registry.register({ id: "a:one", order: 1, tag: "new" });

      expect(notified).toBe(1);
    });
  });
});
