/**
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import usePageSource from "./usePageSource";

vi.mock("@fiftyone/spaces", () => ({ usePanelId: () => "panel" }));

const ids = (page: string[]) => page;

describe("usePageSource", () => {
  it("gives a remount the pages it left, read through the new fetch", async () => {
    const before = vi.fn(async (key: number) => [`a-${key}`]);
    const first = renderHook(() => usePageSource("k1", 0, before, ids));
    await first.result.current.get(0);
    first.unmount();

    const after = vi.fn(async (key: number) => [`b-${key}`]);
    const second = renderHook(() => usePageSource("k1", 0, after, ids));
    expect(second.result.current.peek(0)).toEqual(["a-0"]);

    await second.result.current.get(1);
    expect(after).toHaveBeenCalledWith(1);
    expect(before).toHaveBeenCalledTimes(1);
  });

  it("drops the pages on a refresh, while mounted or not", async () => {
    const fetch = vi.fn(async (key: number) => [`${key}`]);
    const mounted = renderHook(
      ({ refresh }) => usePageSource("k2", refresh, fetch, ids),
      { initialProps: { refresh: 0 } },
    );
    await mounted.result.current.get(0);

    mounted.rerender({ refresh: 1 });
    expect(mounted.result.current.peek(0)).toBeUndefined();
    await mounted.result.current.get(0);
    mounted.unmount();

    const remount = renderHook(() => usePageSource("k2", 2, fetch, ids));
    expect(remount.result.current.peek(0)).toBeUndefined();
  });
});
