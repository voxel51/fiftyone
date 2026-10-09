import type { Controller } from "@react-spring/web";
import { describe, expect, it, vi } from "vitest";
import type { InteractiveItems } from "./types";
import { disposeInteractiveItems, pruneInteractiveItems } from "./utils";

const fakeController = () => ({ stop: vi.fn() }) as unknown as Controller;

const fakeItems = (keys: string[]): InteractiveItems =>
  Object.fromEntries(
    keys.map((key) => [
      key,
      {
        el: null,
        controller: fakeController(),
        // entry/active are irrelevant to disposal
        entry: { key } as never,
        active: false,
      },
    ]),
  );

describe("disposeInteractiveItems", () => {
  it("stops the root controller and every per-entry controller", () => {
    const root = fakeController();
    const items = fakeItems(["a", "b", "c"]);

    disposeInteractiveItems(root, items);

    expect(root.stop).toHaveBeenCalledTimes(1);
    for (const key of Object.keys(items)) {
      expect(items[key].controller.stop).toHaveBeenCalledTimes(1);
    }
  });

  it("stops the root controller even when there are no entries", () => {
    const root = fakeController();

    disposeInteractiveItems(root, {});

    expect(root.stop).toHaveBeenCalledTimes(1);
  });
});

describe("pruneInteractiveItems", () => {
  it("stops and removes entries whose keys are no longer in order", () => {
    const items = fakeItems(["a", "b", "c"]);
    const stale = items.b.controller;

    const pruned = pruneInteractiveItems(items, ["a", "c"]);

    expect(pruned).toBe(1);
    expect(stale.stop).toHaveBeenCalledTimes(1);
    expect(Object.keys(items).sort()).toEqual(["a", "c"]);
  });

  it("keeps all entries and stops none when every key is still live", () => {
    const items = fakeItems(["a", "b"]);

    const pruned = pruneInteractiveItems(items, ["a", "b"]);

    expect(pruned).toBe(0);
    for (const key of Object.keys(items)) {
      expect(items[key].controller.stop).not.toHaveBeenCalled();
    }
  });

  it("removes every entry when order is empty", () => {
    const items = fakeItems(["a", "b", "c"]);
    const controllers = Object.values(items).map((i) => i.controller);

    const pruned = pruneInteractiveItems(items, []);

    expect(pruned).toBe(3);
    expect(Object.keys(items)).toHaveLength(0);
    for (const controller of controllers) {
      expect(controller.stop).toHaveBeenCalledTimes(1);
    }
  });
});
