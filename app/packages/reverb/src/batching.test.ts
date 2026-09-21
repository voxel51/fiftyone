/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom, createStore } from "jotai";
import { describe, expect, it } from "vitest";

/**
 * A transaction is a write-only atom. These assert
 * the two properties that substitution depends on, so a jotai upgrade that
 * changes them fails here rather than as a torn read in the grid.
 */
describe("jotai write semantics the transaction shim depends on", () => {
  it("hides a torn intermediate from a derived atom", () => {
    const a = atom(1);
    const b = atom(1);
    const sum = atom((get) => get(a) + get(b));
    const write = atom(null, (_get, set) => {
      set(a, 10);
      set(b, 10);
    });

    const store = createStore();
    const seen: number[] = [];
    store.sub(sum, () => seen.push(store.get(sum)));
    store.set(write);

    expect(seen).toEqual([20]);
  });

  it("observes an earlier same-write set through get", () => {
    const a = atom(1);
    const seen: number[] = [];
    const write = atom(null, (get, set) => {
      set(a, 2);
      seen.push(get(a));
    });

    const store = createStore();
    store.set(write);

    expect(seen).toEqual([2]);
  });

  it("runs a body passed as the write argument inside the same write", () => {
    const a = atom(1);
    const b = atom(1);
    const sum = atom((get) => get(a) + get(b));
    const transaction = atom(
      null,
      (get, set, body: (t: { get: typeof get; set: typeof set }) => void) =>
        body({ get, set }),
    );

    const store = createStore();
    const seen: number[] = [];
    store.sub(sum, () => seen.push(store.get(sum)));
    store.set(transaction, ({ get, set }) => {
      set(a, 5);
      set(b, get(a));
    });

    expect(store.get(b)).toBe(5);
    expect(seen).toEqual([10]);
  });

  it("keeps write order across a nested write-only atom", () => {
    const order: string[] = [];
    const inner = atom(null, () => void order.push("inner"));
    const outer = atom(null, (_get, set) => {
      order.push("before");
      set(inner);
      order.push("after");
    });

    createStore().set(outer);

    expect(order).toEqual(["before", "inner", "after"]);
  });
});
