import { describe, expect, test, vi } from "vitest";
import { createOwnership } from "../host/ownership";
import { createGridRenderer, type GridRendererOptions } from "./gridRenderer";

const base = () => ({
  detachItem: vi.fn(),
  hideItem: vi.fn(),
  showItem: vi.fn(() => Promise.resolve(1)),
});

const setup = (options: Partial<GridRendererOptions<object>> = {}) => {
  const renderer = base();
  const shimmer = vi.fn(() => Promise.resolve(0));
  const sizes = new Map<string, [number, number]>();
  const scoped = createGridRenderer<object>({
    base: () => renderer,
    cached: () => true,
    deferred: false,
    interim: false,
    ownership: createOwnership(),
    reattach: true,
    shimmer,
    sizes,
    ...options,
  });
  return { renderer, scoped, shimmer, sizes };
};

const item = (
  description: string,
  dimensions: [number, number] = [200, 100],
) => ({
  dimensions,
  element: document.createElement("div"),
  id: { description },
  spotlight: undefined as never,
  zooming: false,
});

describe("createGridRenderer", () => {
  test("a content build shows at real size and records it", () => {
    const { renderer, scoped, sizes } = setup();
    scoped.showItem(item("a", [200, 100]));

    expect(renderer.showItem).toHaveBeenCalledWith(
      expect.objectContaining({ dimensions: [200, 100] }),
    );
    expect(sizes.get("a")).toEqual([200, 100]);
  });

  test("an interim build moves a cached looker at its last size", () => {
    const sizes = new Map<string, [number, number]>([["a", [200, 100]]]);
    const { renderer, scoped, shimmer } = setup({ interim: true, sizes });
    scoped.showItem(item("a", [160, 80]));

    expect(renderer.showItem).toHaveBeenCalledWith(
      expect.objectContaining({ dimensions: [200, 100] }),
    );
    expect(shimmer).not.toHaveBeenCalled();
    expect(sizes.get("a")).toEqual([200, 100]);
  });

  test("an interim build shimmers items never shown or not cached", () => {
    const sizes = new Map<string, [number, number]>([["b", [200, 100]]]);
    const { renderer, scoped, shimmer } = setup({
      cached: (key) => key !== "b",
      interim: true,
      sizes,
    });
    scoped.showItem(item("a"));
    scoped.showItem(item("b"));

    expect(renderer.showItem).not.toHaveBeenCalled();
    expect(shimmer).toHaveBeenCalledTimes(2);
  });

  test("an interim build never reattaches swimlane rows", () => {
    const sizes = new Map<string, [number, number]>([["a", [200, 100]]]);
    const { renderer, scoped, shimmer } = setup({
      interim: true,
      reattach: false,
      sizes,
    });
    scoped.showItem(item("a"));

    expect(renderer.showItem).not.toHaveBeenCalled();
    expect(shimmer).toHaveBeenCalledTimes(1);
  });

  test("a deferred build waits for flush", () => {
    const { renderer, scoped } = setup({ deferred: true });
    scoped.showItem(item("a"));
    expect(renderer.showItem).not.toHaveBeenCalled();

    scoped.flush();
    expect(renderer.showItem).toHaveBeenCalledTimes(1);
  });
});
