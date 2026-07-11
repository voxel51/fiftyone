import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyedIdentityMap } from "./use-keyed-identity-map";

afterEach(() => {
  cleanup();
});

interface Item {
  readonly id: string;
  readonly value: number;
}

function renderMap(initial: {
  extra: number;
  items: readonly Item[];
  onBuild?: (item: Item) => void;
}) {
  return renderHook(
    ({ extra, items, onBuild }) =>
      useKeyedIdentityMap(items, {
        build: (item) => {
          onBuild?.(item);
          return { id: item.id, total: item.value + extra };
        },
        inputs: (item) => [item, item.id === "a" ? extra : 0],
        key: (item) => item.id,
      }),
    { initialProps: initial },
  );
}

describe("useKeyedIdentityMap", () => {
  it("preserves output and array identity when nothing changed", () => {
    const items = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ];
    const { rerender, result } = renderMap({ extra: 0, items });
    const first = result.current;

    rerender({ extra: 0, items });

    expect(result.current).toBe(first);
    expect(result.current[0]).toBe(first[0]);
  });

  it("rebuilds only the item whose inputs changed", () => {
    const built: string[] = [];
    const items = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ];
    const { rerender, result } = renderMap({
      extra: 0,
      items,
      onBuild: (item) => built.push(item.id),
    });
    const first = result.current;
    built.length = 0;

    // `extra` participates only in item "a"'s inputs.
    rerender({ extra: 5, items, onBuild: (item) => built.push(item.id) });

    expect(built).toEqual(["a"]);
    expect(result.current).not.toBe(first);
    expect(result.current[0]).not.toBe(first[0]);
    expect(result.current[0]).toEqual({ id: "a", total: 6 });
    expect(result.current[1]).toBe(first[1]);
  });

  it("rebuilds an item when its identity changes and keeps siblings", () => {
    const itemA = { id: "a", value: 1 };
    const itemB = { id: "b", value: 2 };
    const { rerender, result } = renderMap({ extra: 0, items: [itemA, itemB] });
    const first = result.current;

    rerender({ extra: 0, items: [{ id: "a", value: 9 }, itemB] });

    expect(result.current[0]).not.toBe(first[0]);
    expect(result.current[0]).toEqual({ id: "a", total: 9 });
    expect(result.current[1]).toBe(first[1]);
  });

  it("drops cache entries for removed keys", () => {
    const build = vi.fn((item: Item) => item.id);
    const { rerender, result } = renderHook(
      ({ items }: { items: readonly Item[] }) =>
        useKeyedIdentityMap(items, {
          build,
          inputs: (item) => [item],
          key: (item) => item.id,
        }),
      { initialProps: { items: [{ id: "a", value: 1 }] as readonly Item[] } },
    );
    const itemA = { id: "a", value: 1 };

    rerender({ items: [] });
    expect(result.current).toEqual([]);

    // "a" was pruned: the same key re-added must rebuild, not resurrect.
    build.mockClear();
    rerender({ items: [itemA] });
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("keeps per-item outputs across reorders", () => {
    const itemA = { id: "a", value: 1 };
    const itemB = { id: "b", value: 2 };
    const { rerender, result } = renderMap({ extra: 0, items: [itemA, itemB] });
    const [firstA, firstB] = result.current;

    rerender({ extra: 0, items: [itemB, itemA] });

    expect(result.current[0]).toBe(firstB);
    expect(result.current[1]).toBe(firstA);
  });
});
