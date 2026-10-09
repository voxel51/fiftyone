import { describe, expect, test } from "vitest";
import { createOwnership, scopeRenderer } from "../../host/ownership";
import { createRowSource, createRowStore } from "./rowPages";

describe("createRowSource", () => {
  test("pages the row axis in chunks with stable ids", async () => {
    const source = createRowSource(45, (index) => `r${index}`, 20);
    const first = await source.get(0);
    expect(first.items.map((item) => item.data.index)).toEqual(
      Array.from({ length: 20 }, (_, i) => i),
    );
    expect([first.next, first.previous]).toEqual([1, null]);

    const last = await source.get(2);
    expect(last.items.map((item) => item.id.description)).toEqual([
      "r40",
      "r41",
      "r42",
      "r43",
      "r44",
    ]);
    expect([last.next, last.previous]).toEqual([null, 1]);
    expect((await source.get(0)).items[0].id).toBe(first.items[0].id);
  });
});

describe("createRowStore", () => {
  const show = (
    renderer: ReturnType<typeof createRowStore>["renderer"],
    description: string,
    element = document.createElement("div"),
  ) =>
    renderer.showItem({
      dimensions: [1000, 120],
      element,
      id: { description },
      spotlight: undefined as never,
      zooming: false,
    });

  test("tracks shown rows and drops hidden ones", () => {
    const store = createRowStore();
    show(store.renderer, "a");
    show(store.renderer, "b");
    expect([...store.getSnapshot().keys()]).toEqual(["a", "b"]);

    store.renderer.hideItem({ id: { description: "a" } });
    expect([...store.getSnapshot().keys()]).toEqual(["b"]);
  });

  test("a repeated show of the same tile does not notify", () => {
    const store = createRowStore();
    const element = document.createElement("div");
    show(store.renderer, "a", element);
    const snapshot = store.getSnapshot();
    show(store.renderer, "a", element);
    expect(store.getSnapshot()).toBe(snapshot);
  });

  test("a replaced instance's teardown leaves rows the next one shows", () => {
    const store = createRowStore();
    const ownership = createOwnership();
    const old = scopeRenderer(store.renderer, ownership);
    const next = scopeRenderer(store.renderer, ownership);
    const tile = document.createElement("div");

    show(old, "a");
    show(next, "a", tile);
    old.detachItem({ description: "a" });
    expect(store.getSnapshot().get("a")?.element).toBe(tile);
  });
});
