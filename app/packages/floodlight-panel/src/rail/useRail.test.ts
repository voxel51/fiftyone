/**
 * @vitest-environment jsdom
 */

import { RowChange } from "@fiftyone/floodlight";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import useRail from "./useRail";

const setup = (ranks: Record<string, number>) => {
  const instance = new EventTarget();
  const view = { scrolled: 40 };
  let scrolled: (() => void) | undefined;
  const order = new Map(Object.entries(ranks));
  const { result } = renderHook(() =>
    useRail({
      instance,
      pageSize: 100,
      ranks: order,
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
  it("follows the reported row", () => {
    const { result, row } = setup({ a: 7 });
    row("a");
    expect(result.current.anchorRank).toBe(7);
  });

  it("reads the start of the view as rank 0", () => {
    const { result, row, scroll } = setup({ a: 4 });
    row("a");
    expect(result.current.anchorRank).toBe(4);

    scroll(0);
    expect(result.current.anchorRank).toBe(0);
  });

  it("follows the scroll between rows", () => {
    const { result, row, scroll } = setup({ a: 20 });
    const seen: number[] = [];
    result.current.follow((rank) => seen.push(rank));
    row("a");
    // 50 items over 5000px: scrolling 150px past the row is 1.5 items
    scroll(190);
    expect(seen.at(-1)).toBe(21.5);
  });

  it("does not take a later page's scroll start for the top", () => {
    const { result, row, scroll } = setup({ a: 250 });
    row("a");
    scroll(0);
    expect(result.current.anchorRank).toBe(250);
  });
});
