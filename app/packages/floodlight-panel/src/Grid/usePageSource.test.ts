/**
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import usePageSource from "./usePageSource";

vi.mock("@fiftyone/spaces", () => ({ usePanelId: () => "panel" }));

const ids = (page: string[]) => page;
const onEvict = () => undefined;

describe("usePageSource", () => {
  it("gives a remount the pages it left, read through the new fetch", async () => {
    const before = vi.fn(async (key: number) => [`a-${key}`]);
    const first = renderHook(() =>
      usePageSource("k1", 0, before, ids, onEvict),
    );
    await first.result.current.get(0);
    first.unmount();

    const after = vi.fn(async (key: number) => [`b-${key}`]);
    const second = renderHook(() =>
      usePageSource("k1", 0, after, ids, onEvict),
    );
    expect(second.result.current.peek(0)).toEqual(["a-0"]);

    await second.result.current.get(1);
    expect(after).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    expect(before).toHaveBeenCalledTimes(1);
  });

  it("drops the pages on a refresh, while mounted or not", async () => {
    const fetch = vi.fn(async (key: number) => [`${key}`]);
    const mounted = renderHook(
      ({ refresh }) => usePageSource("k2", refresh, fetch, ids, onEvict),
      { initialProps: { refresh: 0 } },
    );
    await mounted.result.current.get(0);

    mounted.rerender({ refresh: 1 });
    expect(mounted.result.current.peek(0)).toBeUndefined();
    await mounted.result.current.get(0);
    mounted.unmount();

    const remount = renderHook(() =>
      usePageSource("k2", 2, fetch, ids, onEvict),
    );
    expect(remount.result.current.peek(0)).toBeUndefined();
  });

  it("aborts the old pages' warms when its key changes", () => {
    const signals: AbortSignal[] = [];
    const fetch = (_: number, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<string[]>(() => undefined);
    };
    const mounted = renderHook(
      ({ key }) => usePageSource(key, 0, fetch, ids, onEvict),
      { initialProps: { key: "k3" } },
    );
    mounted.result.current.warm(1);
    expect(signals).toHaveLength(1);

    mounted.rerender({ key: "k4" });
    expect(signals[0].aborted).toBe(true);
  });
});
