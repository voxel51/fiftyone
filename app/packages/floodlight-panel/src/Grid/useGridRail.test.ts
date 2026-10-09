/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Order } from "../order/order";
import useGridRail from "./useGridRail";
import type { Origin } from "./useSpotlightPager";

const indexed: Order = {
  kind: "order",
  token: "t",
  mode: "INDEXED",
  total: null,
  bounds: { min: 0, max: 1, scale: "NUMBER" },
  desc: false,
  ticks: [],
};

const setup = (order: Order = indexed) => {
  const host = { rebuild: vi.fn() };
  const seek = vi.fn();
  const sequences = new Map([
    ["a", 0],
    ["b", 1],
  ]);
  const fractions = new Map([
    ["a", 0.2],
    ["b", 0.4],
  ]);
  const { rerender, result } = renderHook(
    ({ origin }: { origin: Origin }) =>
      useGridRail({
        extent: () => undefined,
        fractions,
        host,
        onScroll: () => () => undefined,
        order,
        origin,
        pageSize: 20,
        paged: false,
        seek,
        sequences,
      }),
    { initialProps: { origin: { id: 0 } as Origin } },
  );
  return { host, rerender, result, seek };
};

describe("useGridRail", () => {
  it("jumps in place when the target is loaded, without a seek", () => {
    const { host, result, seek } = setup();
    act(() => result.current.jump(0.3));
    expect(host.rebuild).toHaveBeenCalledWith({
      key: 0,
      at: { description: "b", fraction: 0 },
    });
    expect(seek).not.toHaveBeenCalled();
  });

  it("seeks once for a target that is not loaded", () => {
    const { host, result, seek } = setup();
    act(() => result.current.jump(0.9));
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith({ fraction: 0.9 });
    expect(host.rebuild).not.toHaveBeenCalled();
  });

  it("rebuilds at the seek's page once the origin moves", () => {
    const { host, rerender } = setup();
    rerender({ origin: { id: 1, seek: { fraction: 0.9 } } });
    expect(host.rebuild).toHaveBeenCalledTimes(1);
    expect(host.rebuild).toHaveBeenCalledWith({ key: 0 });
  });

  it("leaves new data's reset origin to the grid", () => {
    const { host, rerender } = setup();
    rerender({ origin: { id: 0 } });
    expect(host.rebuild).not.toHaveBeenCalled();
  });

  it("never seeks a SCROLL order", () => {
    const { result, seek } = setup({
      ...indexed,
      mode: "SCROLL",
      bounds: null,
    });
    expect(result.current.mode.kind).toBe("none");
    act(() => result.current.jump(0.5));
    expect(seek).not.toHaveBeenCalled();
  });
});
