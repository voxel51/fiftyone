/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom as primitiveAtom, createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { atom } from "./atom";
import { atomFamily, selectorFamily } from "./family";
import { loadable, stableLoadable } from "./loadable";
import { selector, waitForAll } from "./selector";
import { snapshot } from "./snapshot";
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

  it("keeps following a state-backed default after a reset", () => {
    const source = atom<number>({ key: "resetSource", default: 1 });
    const follower = atom<number>({ key: "resetFollower", default: source });
    const store = createStore();

    expect(store.get(follower)).toBe(1);

    store.set(follower, 99);
    expect(store.get(follower)).toBe(99);

    store.set(follower, DEFAULT_VALUE);
    expect(store.get(follower)).toBe(1);

    // The default is state, so the reset has to leave it tracking.
    store.set(source, 2);
    expect(store.get(follower)).toBe(2);
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

  it("separates parameters JSON alone cannot tell apart", () => {
    const family = atomFamily<number, unknown>({
      key: "unequalParams",
      default: 0,
    });
    const store = createStore();

    const distinct = [
      [new Set([1, 2]), new Set([3])],
      [new Map([["a", 1]]), new Map([["b", 2]])],
      [{ at: Number.NaN }, { at: Number.POSITIVE_INFINITY }],
      [{ at: Number.NaN }, { at: null }],
    ];

    distinct.forEach(([left, right], index) => {
      store.set(family(left), index + 1);

      expect(store.get(family(right))).toBe(0);
      expect(store.get(family(left))).toBe(index + 1);
    });
  });

  it("separates a set from an object shaped like its encoding", () => {
    const family = atomFamily<number, unknown>({
      key: "encodingParams",
      default: 0,
    });
    const store = createStore();

    const collisions = [
      [new Set(["a"]), { set: ['"a"'] }],
      [Number.NaN, "number:NaN"],
      [1, "1"],
      [null, "null"],
    ];

    collisions.forEach(([left, right], index) => {
      store.set(family(left), index + 1);

      expect(store.get(family(right))).toBe(0);
      expect(store.get(family(left))).toBe(index + 1);
    });
  });

  it("gives structurally equal parameters one member", () => {
    const family = atomFamily<number, unknown>({
      key: "equalParams",
      default: 0,
    });
    const store = createStore();

    store.set(family({ modal: true, path: "one" }), 7);

    expect(store.get(family({ path: "one", modal: true }))).toBe(7);
    expect(store.get(family(new Set(["a"])))).toBe(0);

    store.set(family(new Set(["a"])), 9);

    expect(store.get(family(new Set(["a"])))).toBe(9);
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

describe("waitForAll", () => {
  it("resolves async members rather than handing back promises", async () => {
    const slow = atom<Promise<number>>({
      key: "allSlow",
      default: Promise.resolve(1),
    });
    const quick = atom<number>({ key: "allQuick", default: 2 });
    const store = createStore();

    const list = await store.get(waitForAll([slow, quick] as never));
    expect(list).toEqual([1, 2]);

    const shape = await store.get(
      waitForAll({ slow, quick } as never) as never,
    );
    expect(shape).toEqual({ slow: 1, quick: 2 });
  });
});

describe("snapshot", () => {
  it("reports a throwing selector as an error loadable", () => {
    const failure = new Error("nope");
    const broken = selector<number>({
      key: "snapshotThrows",
      get: () => {
        throw failure;
      },
    });
    const store = createStore();

    const result = snapshot(store).getLoadable(broken);

    expect(result.state).toBe("hasError");
    expect(result.contents).toBe(failure);
  });
});

describe("pending dependencies", () => {
  it("tracks a dependency read after an awaited one", async () => {
    const slow = atom<Promise<number>>({
      key: "trackSlow",
      default: Promise.resolve(1),
    });
    const after = atom<number>({ key: "trackAfter", default: 10 });
    const sum = selector<number>({
      key: "trackSum",
      // A pending dependency suspends and the read resumes with the settled
      // value, which the types do not model.
      get: ({ get }) => (get(slow) as unknown as number) + get(after),
    });
    const store = createStore();

    // Subscribed, so the value is cached and only a tracked dependency
    // invalidates it. `after` is reached only once the awaited dependency
    // settles, which is outside the pass that registers dependencies.
    let notified = 0;
    const unsubscribe = store.sub(sum, () => void notified++);

    expect(await store.get(sum)).toBe(11);
    await Promise.resolve();

    // Count only what the write below causes, not the initial settle.
    const settled = notified;

    store.set(after, 20);
    await Promise.resolve();

    expect(notified).toBeGreaterThan(settled);
    expect(await store.get(sum)).toBe(21);

    unsubscribe();
  });

  it("suspends a selector rather than handing it a promise", async () => {
    let settle: (value: number[]) => void = () => undefined;
    const source = primitiveAtom<number[]>(
      new Promise<number[]>((r) => {
        settle = r;
      }) as unknown as number[],
    );

    const derived = selector<number | undefined>({
      key: "findsInPending",
      // would throw "find is not a function" if handed the promise
      get: ({ get }) => get(source).find((n) => n > 1),
    });

    const store = createStore();
    const read = store.get(derived);
    expect(read).toBeInstanceOf(Promise);

    settle([1, 2, 3]);
    await expect(read).resolves.toBe(2);
  });
});
