/**
 * @vitest-environment jsdom
 */

import { RowChange } from "@fiftyone/floodlight";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import useRail from "./useRail";

const setup = (fractions: Record<string, number>, perItem?: number) => {
  const instance = new EventTarget();
  const view = { scrolled: 40 };
  let scrolled: (() => void) | undefined;
  const known = new Map(Object.entries(fractions));
  const fractionOf = (id: string) => known.get(id);
  const { result } = renderHook(() =>
    useRail({
      instance,
      fractionOf,
      perItem,
      extent: () => ({ items: 50, loaded: 5000, viewport: 500, ...view }),
      onScroll: (listener) => {
        scrolled = listener;
        return () => (scrolled = undefined);
      },
    }),
  );
  const row = (id: string) =>
    act(() => {
      instance.dispatchEvent(new RowChange({ description: id }, 0, 0));
    });
  const scroll = (to: number) =>
    act(() => {
      view.scrolled = to;
      scrolled?.();
    });
  return { result, row, scroll };
};

describe("useRail", () => {
  it("puts the thumb at the reported row's fraction", () => {
    const { result, row } = setup({ a: 0.25 });
    row("a");
    expect(result.current.fraction).toBe(0.25);
    expect(result.current.visible).toBe(5);
  });

  it("interpolates a counted order by its items between rows", () => {
    const { result, row, scroll } = setup({ a: 0.2 }, 1 / 100);
    const seen: number[] = [];
    result.current.follow((fraction) => seen.push(fraction));
    row("a");
    // 50 items over 5000px: 150px past the row is 1.5 items of 100
    scroll(190);
    expect(seen.at(-1)).toBeCloseTo(0.215);
  });

  it("interpolates a value order at the pace of its last rows", () => {
    const { result, row, scroll } = setup({ a: 0.2, b: 0.3 });
    const seen: number[] = [];
    result.current.follow((fraction) => seen.push(fraction));
    row("a");
    scroll(140);
    // no pace yet: the thumb waits for the next row
    expect(seen).toEqual([]);
    row("b");
    scroll(190);
    expect(seen.at(-1)).toBeCloseTo(0.35);
  });

  it("never interpolates past the end", () => {
    const { result, row, scroll } = setup({ a: 0.99 }, 1 / 10);
    const seen: number[] = [];
    result.current.follow((fraction) => seen.push(fraction));
    row("a");
    scroll(10_000);
    expect(seen.at(-1)).toBe(1);
  });
});
