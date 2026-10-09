/**
 * @vitest-environment jsdom
 */

import { RowChange } from "@fiftyone/floodlight";
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

interface Props {
  origin: Origin;
  instance?: EventTarget;
  ready?: boolean;
}

const setup = (order: Order = indexed, instance?: EventTarget) => {
  const host = { rebuild: vi.fn() };
  const seek = vi.fn();
  const sequences = new Map([
    ["a", 0],
    ["b", 1],
  ]);
  const fractions = new Map([
    ["a", 0.2],
    ["b", 0.4],
    ["z", 0.88],
  ]);
  const { rerender, result } = renderHook(
    ({ origin, instance, ready = true }: Props) =>
      useGridRail({
        extent: () => undefined,
        fractions,
        host,
        instance,
        onScroll: () => () => undefined,
        order,
        origin,
        pageSize: 20,
        paged: false,
        ready,
        seek,
        sequences,
      }),
    { initialProps: { origin: { id: 0 } as Origin, instance } as Props },
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

  it("holds the thumb at a release until the jump's instance shows", () => {
    const shown = new EventTarget();
    const row = (instance: EventTarget, id: string) =>
      act(() => {
        instance.dispatchEvent(new RowChange({ description: id }, 0, 0));
      });
    const { rerender, result } = setup(indexed, shown);
    row(shown, "a");
    expect(result.current.position).toBe(0.2);
    const followed: number[] = [];
    result.current.follow((position) => followed.push(position));

    act(() => result.current.jump(0.9));
    expect(result.current.position).toBe(0.9);

    // the outgoing instance still reports its top row
    row(shown, "b");
    expect(result.current.position).toBe(0.9);

    // the seek's instance builds, then shows
    const next = new EventTarget();
    const origin = { id: 1, seek: { fraction: 0.9 } };
    rerender({ origin, instance: next, ready: false });
    row(next, "z");
    expect(result.current.position).toBe(0.9);
    rerender({ origin, instance: next, ready: true });
    expect(result.current.position).toBe(0.88);
    expect(followed).toEqual([]);
  });

  it("holds an in-place jump too, and a new drag drops the hold", () => {
    const shown = new EventTarget();
    const { result } = setup(indexed, shown);
    act(() => {
      shown.dispatchEvent(new RowChange({ description: "a" }, 0, 0));
    });
    act(() => result.current.jump(0.3));
    expect(result.current.position).toBe(0.3);

    act(() => result.current.drag(true));
    expect(result.current.position).toBe(0.2);
  });
});
