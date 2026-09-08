import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { createStore, Provider } from "jotai";
import { describe, expect, it } from "vitest";

import {
  hoverEchoAtom,
  useOwnedHoverEchoPublisher,
  type HoverEcho,
} from "./hover-echo";

describe("owned hover echo publisher", () => {
  it("retracts its current hover by identity", () => {
    const store = createStore();
    const { result } = renderPublisher(store);
    const hover = pointHover("/lidar", 42n);

    act(() => result.current.publish("point", hover));
    expect(store.get(hoverEchoAtom)).toBe(hover);

    let retired: ReturnType<typeof result.current.retract> = null;
    act(() => {
      retired = result.current.retract("point");
    });
    expect(retired).toEqual({ cleared: true, hover, key: "point" });
    expect(store.get(hoverEchoAtom)).toBeNull();
  });

  it("preserves a newer hover while relinquishing stale ownership", () => {
    const store = createStore();
    const { result } = renderPublisher(store);
    const owned = pointHover("/lidar", 42n);
    const newer = pointHover("/camera", 43n);

    act(() => {
      result.current.publish("point", owned);
      store.set(hoverEchoAtom, newer);
    });

    let retired: ReturnType<typeof result.current.retract> = null;
    act(() => {
      retired = result.current.retract("point");
    });
    expect(retired).toEqual({ cleared: false, hover: owned, key: "point" });
    expect(store.get(hoverEchoAtom)).toBe(newer);
    expect(result.current.retract("point")).toBeNull();
  });

  it("retires selected owners and disowns the remainder", () => {
    const store = createStore();
    const { result } = renderPublisher(store);
    const oldHover = pointHover("/old", 1n);
    const currentHover = pointHover("/current", 2n);

    act(() => {
      result.current.publish("old", oldHover);
      result.current.publish("current", currentHover);
    });

    let retired: readonly { readonly key: string }[] = [];
    act(() => {
      retired = result.current.retire((key) => key === "old");
    });
    expect(retired).toMatchObject([{ cleared: false, key: "old" }]);
    expect(store.get(hoverEchoAtom)).toBe(currentHover);

    let disowned: readonly { readonly key: string }[] = [];
    act(() => {
      disowned = result.current.disownAll();
    });
    expect(disowned).toMatchObject([{ cleared: true, key: "current" }]);
    expect(store.get(hoverEchoAtom)).toBeNull();
  });
});

function renderPublisher(store: ReturnType<typeof createStore>) {
  const wrapper = ({ children }: { readonly children: ReactNode }) =>
    createElement(Provider, { store }, children);
  return renderHook(() => useOwnedHoverEchoPublisher<string>(), { wrapper });
}

function pointHover(stream: string, contentTimeNs: bigint): HoverEcho {
  return {
    color: null,
    contentTimeNs,
    fields: {},
    kind: "point",
    pointIndex: 0,
    position: [1, 2, 3],
    stream,
  };
}
