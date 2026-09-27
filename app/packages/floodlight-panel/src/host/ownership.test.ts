import { describe, expect, test, vi } from "vitest";
import { type Renderer, scopeRenderer } from "./ownership";

const base = () => ({
  detachItem: vi.fn(),
  hideItem: vi.fn(),
  showItem: vi.fn(() => Promise.resolve(0)),
});

const show = (renderer: Renderer<number, object>, description: string) =>
  renderer.showItem({
    dimensions: [1, 1],
    element: document.createElement("div"),
    id: { description },
    spotlight: undefined as never,
    zooming: false,
  });

describe("scopeRenderer", () => {
  test("an instance detaches the items it owns", () => {
    const renderer = base();
    const scoped = scopeRenderer(renderer, {});

    show(scoped, "a");
    scoped.detachItem({ description: "a" });
    expect(renderer.detachItem).toHaveBeenCalledTimes(1);
  });

  test("tearing down an instance leaves items another instance took over", () => {
    const renderer = base();
    const group = {};
    const old = scopeRenderer(renderer, group);
    const next = scopeRenderer(renderer, group);

    show(old, "a");
    show(next, "a");
    old.hideItem({ id: { description: "a" } });
    old.detachItem({ description: "a" });

    expect(renderer.hideItem).not.toHaveBeenCalled();
    expect(renderer.detachItem).not.toHaveBeenCalled();
    next.detachItem({ description: "a" });
    expect(renderer.detachItem).toHaveBeenCalledTimes(1);
  });

  test("groups are independent", () => {
    const renderer = base();
    const a = scopeRenderer(renderer, {});
    const b = scopeRenderer(renderer, {});

    show(a, "x");
    show(b, "x");
    a.detachItem({ description: "x" });
    expect(renderer.detachItem).toHaveBeenCalledTimes(1);
  });
});
