import { describe, expect, it, vi } from "vitest";
import { gridItems } from "./itemCache";

describe("gridItems", () => {
  it("keeps a panel's items while its key holds", () => {
    const items = gridItems("keeps", "one");
    items.records.set("sample", 1);
    items.pages.add(0);

    const again = gridItems("keeps", "one");

    expect(again).toBe(items);
    expect(again.records.get("sample")).toBe(1);
    expect(again.pages.has(0)).toBe(true);
  });

  it("replaces them, and disposes the lookers, when the key changes", () => {
    const items = gridItems("replaces", "one");
    const remove = vi.fn();
    items.lookers = { delete: remove } as unknown as typeof items.lookers;
    items.records.set("sample", 1);

    const next = gridItems("replaces", "two");

    expect(next).not.toBe(items);
    expect(next.records.size).toBe(0);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("keeps panels apart", () => {
    expect(gridItems("left", "one")).not.toBe(gridItems("right", "one"));
  });
});
