// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColorMeta, ColorValues } from "./protocol";
import { useLocalColorMask } from "./useLocalColorMask";

const META: ColorMeta = {
  style: "categorical",
  exact: true,
  classes: [
    { label: "cat", count: 2 },
    { label: "dog", count: 1 },
  ],
};
const COLUMN: ColorValues = {
  style: "categorical",
  indices: new Uint16Array([0, 1, 0]),
};

type Filters = Record<string, unknown>;

const render = (filters: Filters) =>
  renderHook(
    ({ f }: { f: Filters }) => useLocalColorMask(f, "cluster", COLUMN, META),
    { initialProps: { f: filters } },
  );

describe("useLocalColorMask", () => {
  it("evaluates the color-field filter locally and strips it from the server's", () => {
    const { result } = render({
      cluster: { values: ["cat"], exclude: true },
      other: { values: ["x"], exclude: false },
    });

    expect(result.current.localMask).not.toBeNull();
    expect(Array.from(result.current.localMask ?? [])).toEqual([0, 1, 0]);
    expect(result.current.serverFilters).toEqual({
      other: { values: ["x"], exclude: false },
    });
  });

  // The load-bearing contract: a legend click replaces the filters
  // object but only changes the locally-handled entry — the masks
  // fetch must NOT re-fire, so serverFilters must keep its identity
  it("keeps serverFilters identity across local-only filter changes", () => {
    const { result, rerender } = render({
      cluster: { values: ["cat"], exclude: true },
      other: { values: ["x"], exclude: false },
    });
    const before = result.current.serverFilters;

    rerender({
      f: {
        cluster: { values: ["dog"], exclude: true },
        other: { values: ["x"], exclude: false },
      },
    });
    expect(result.current.serverFilters).toBe(before);
    // ...while the local mask did change
    expect(Array.from(result.current.localMask ?? [])).toEqual([1, 0, 1]);

    // A change to another field's filter must re-fire
    rerender({
      f: {
        cluster: { values: ["dog"], exclude: true },
        other: { values: ["y"], exclude: false },
      },
    });
    expect(result.current.serverFilters).not.toBe(before);
  });

  it("leaves unevaluable filters on the server path", () => {
    // "zebra" is not in the class list — the server's mask is truth
    const { result } = render({
      cluster: { values: ["zebra"], exclude: true },
    });

    expect(result.current.localMask).toBeNull();
    expect(result.current.serverFilters).toEqual({
      cluster: { values: ["zebra"], exclude: true },
    });
  });
});
