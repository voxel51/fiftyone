/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { atom } from "./atom";
import { atomFamily, selectorFamily } from "./family";
import { loadable, stableLoadable } from "./loadable";
import { selector } from "./selector";
import { DEFAULT_VALUE, DefaultValue } from "./sentinel";
import { runTransaction } from "./transaction";

describe("reset", () => {
  it("restores the default of plain state", () => {
    const count = atom({ key: "count", default: 7 });
    const store = createStore();

    store.set(count, 12);
    expect(store.get(count)).toBe(12);

    store.set(count, DEFAULT_VALUE);
    expect(store.get(count)).toBe(7);
  });

  it("reaches a writable selector's own set rather than resetting behind it", () => {
    const backing = atom<string | null>({ key: "backing", default: null });
    const observed: unknown[] = [];

    const facade = selector<string | null>({
      key: "facade",
      get: ({ get }) => get(backing),
      set: ({ set }, next) => {
        observed.push(next);
        set(backing, next instanceof DefaultValue ? "from-set" : next);
      },
    });

    const store = createStore();
    runTransaction(store, ({ reset }) => reset(facade));

    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeInstanceOf(DefaultValue);
    // Short-circuiting the reset would leave this null and skip the write path.
    expect(store.get(backing)).toBe("from-set");
  });

  it("is recognizable after the write that carried it returned", () => {
    const captured: unknown[] = [];
    const state = atom<string | null>({ key: "deferred", default: null });

    const facade = selector<string | null>({
      key: "deferred-facade",
      get: ({ get }) => get(state),
      set: (_accessors, next) => void setTimeout(() => captured.push(next), 0),
    });

    const store = createStore();
    runTransaction(store, ({ reset }) => reset(facade));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(captured[0]).toBeInstanceOf(DefaultValue);
        resolve();
      }, 1);
    });
  });
});

describe("updater form", () => {
  it("resolves against the current value", () => {
    const count = atom({ key: "updater", default: 1 });
    const store = createStore();

    store.set(count, (previous) => previous + 4);

    expect(store.get(count)).toBe(5);
  });
});

describe("families", () => {
  it("names one member for structurally equal parameters", () => {
    const family = atomFamily<number, { path: string; modal: boolean }>({
      key: "byPath",
      default: 0,
    });

    expect(family({ path: "a", modal: true })).toBe(
      family({ path: "a", modal: true }),
    );
    // Key order must not split the member.
    expect(family({ path: "a", modal: true })).toBe(
      family({ modal: true, path: "a" }),
    );
    expect(family({ path: "b", modal: true })).not.toBe(
      family({ path: "a", modal: true }),
    );
  });

  it("names one member for a repeated empty parameter", () => {
    const family = atomFamily<string[], Record<string, never>>({
      key: "excludedPaths",
      default: [],
    });
    const store = createStore();

    store.set(family({}), ["x"]);

    // A writer and a reader that both pass `{}` must land on one member.
    expect(store.get(family({}))).toEqual(["x"]);
  });

  it("derives a member per parameter", () => {
    const doubled = selectorFamily<number, number>({
      key: "doubled",
      get: (param) => () => param * 2,
    });
    const store = createStore();

    expect(store.get(doubled(3))).toBe(6);
    expect(store.get(doubled(4))).toBe(8);
  });
});

describe("transaction", () => {
  it("commits many writes as one", () => {
    const a = atom({ key: "a", default: 0 });
    const b = atom({ key: "b", default: 0 });
    const total = selector<number>({
      key: "total",
      get: ({ get }) => get(a) + get(b),
    });

    const store = createStore();
    const seen: number[] = [];
    store.sub(total, () => seen.push(store.get(total)));

    runTransaction(store, ({ set }) => {
      set(a, 5);
      set(b, 5);
    });

    expect(seen).toEqual([10]);
  });

  it("returns the body's value", () => {
    expect(runTransaction(createStore(), () => "returned")).toBe("returned");
  });
});

describe("loadable", () => {
  it("carries the pending promise as contents", () => {
    const pending = new Promise<number>(() => undefined);
    const result = loadable(pending);

    expect(result.state).toBe("loading");
    // `contents instanceof Promise` is a load test at one call site.
    expect(result.contents).toBe(pending);
  });

  it("reports a settled value on a later read", async () => {
    const resolved = Promise.resolve(3);
    expect(loadable(resolved).state).toBe("loading");

    await resolved;

    const settled = loadable(resolved);
    expect(settled.state).toBe("hasValue");
    expect(settled.getValue()).toBe(3);
  });

  it("reports a rejection without throwing on read", async () => {
    const failure = new Error("nope");
    const rejected = Promise.reject(failure);
    loadable(rejected);

    await rejected.catch(() => undefined);

    const settled = loadable(rejected);
    expect(settled.state).toBe("hasError");
    expect(() => settled.getValue()).toThrow(failure);
  });

  it("is referentially stable while the value is unchanged", () => {
    const owner = {};

    expect(stableLoadable(owner, 1)).toBe(stableLoadable(owner, 1));
    expect(stableLoadable(owner, 2)).not.toBe(stableLoadable(owner, 1));
  });
});

describe("selector", () => {
  it("does not expose a set on read-only state", () => {
    const readOnly = selector<number>({ key: "readOnly", get: () => 1 });

    expect(createStore().get(readOnly)).toBe(1);
    expect("write" in readOnly).toBe(false);
  });

  it("recomputes from its dependencies", () => {
    const source = atom({ key: "source", default: 2 });
    const derived = selector<number>({
      key: "derived",
      get: ({ get }) => get(source) * 3,
    });
    const store = createStore();

    expect(store.get(derived)).toBe(6);
    store.set(source, 5);
    expect(store.get(derived)).toBe(15);
  });
});
