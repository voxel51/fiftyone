import { describe, expect, test, vi } from "vitest";
import { createOwnership, type Renderer, scopeRenderer } from "./ownership";

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
    const scoped = scopeRenderer(renderer, createOwnership());

    show(scoped, "a");
    scoped.detachItem({ description: "a" });
    expect(renderer.detachItem).toHaveBeenCalledTimes(1);
  });

  test("tearing down an instance leaves items another instance took over", () => {
    const renderer = base();
    const group = createOwnership();
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
    const a = scopeRenderer(renderer, createOwnership());
    const b = scopeRenderer(renderer, createOwnership());

    show(a, "x");
    show(b, "x");
    a.detachItem({ description: "x" });
    expect(renderer.detachItem).toHaveBeenCalledTimes(1);
  });

  test("a deferred instance records shows and performs them at flush", () => {
    const renderer = base();
    const shared = createOwnership();
    const old = scopeRenderer(renderer, shared);
    const next = scopeRenderer(renderer, shared);

    show(old, "a");
    next.defer();
    show(next, "a");
    show(next, "b");
    next.hideItem({ id: { description: "b" } });
    expect(renderer.showItem).toHaveBeenCalledTimes(1);

    old.retire();
    next.flush();
    expect(renderer.showItem).toHaveBeenCalledTimes(2);
    old.detachItem({ description: "a" });
    expect(renderer.detachItem).not.toHaveBeenCalled();
    next.detachItem({ description: "a" });
    expect(renderer.detachItem).toHaveBeenCalledTimes(1);
  });

  test("a retired instance can no longer show, hide or detach", () => {
    const renderer = base();
    const scoped = scopeRenderer(renderer, createOwnership());
    show(scoped, "a");
    scoped.retire();

    show(scoped, "b");
    scoped.hideItem({ id: { description: "a" } });
    scoped.detachItem({ description: "a" });
    expect(renderer.showItem).toHaveBeenCalledTimes(1);
    expect(renderer.hideItem).not.toHaveBeenCalled();
    expect(renderer.detachItem).not.toHaveBeenCalled();
  });
});
