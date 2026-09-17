/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { atom } from "./atom";
import type { AtomEffect } from "./effects";
import { atomFamily } from "./family";
import { DEFAULT_VALUE, DefaultValue } from "./sentinel";

describe("atom effects", () => {
  it("seeds a value on first subscription", () => {
    const seed: AtomEffect<string> = ({ setSelf, trigger }) => {
      if (trigger === "get") {
        setSelf("stored");
      }
    };
    const state = atom<string>({
      key: "seeded",
      default: "initial",
      effects: [seed],
    });

    const store = createStore();
    // onMount runs on subscription, which is what a mounted reader does.
    store.sub(state, () => undefined);

    expect(store.get(state)).toBe("stored");
  });

  it("reports writes to onSet with the previous value", () => {
    const seen: Array<[string, unknown, boolean]> = [];
    const record: AtomEffect<string> = ({ onSet }) =>
      onSet((next, previous, isReset) => seen.push([next, previous, isReset]));

    const state = atom<string>({
      key: "recorded",
      default: "a",
      effects: [record],
    });

    const store = createStore();
    store.sub(state, () => undefined);
    store.set(state, "b");
    store.set(state, "c");

    expect(seen).toEqual([
      ["b", "a", false],
      ["c", "b", false],
    ]);
  });

  it("flags a reset and reports the default as the new value", () => {
    const seen: Array<[string, boolean]> = [];
    const record: AtomEffect<string> = ({ onSet }) =>
      onSet((next, _previous, isReset) => seen.push([next, isReset]));

    const state = atom<string>({
      key: "resettable",
      default: "base",
      effects: [record],
    });

    const store = createStore();
    store.sub(state, () => undefined);
    store.set(state, "changed");
    store.set(state, DEFAULT_VALUE);

    expect(seen).toEqual([
      ["changed", false],
      ["base", true],
    ]);
    expect(store.get(state)).toBe("base");
  });

  it("does not report setSelf to onSet", () => {
    const seen: string[] = [];
    const state = atom<string>({
      key: "selfWrite",
      default: "a",
      effects: [
        ({ onSet }) => onSet((next) => seen.push(next)),
        ({ setSelf }) => setSelf("from-effect"),
      ],
    });

    const store = createStore();
    store.sub(state, () => undefined);

    expect(store.get(state)).toBe("from-effect");
    expect(seen).toEqual([]);
  });

  it("runs teardown when the last subscriber goes away", () => {
    let torn = false;
    const state = atom<number>({
      key: "tornDown",
      default: 0,
      effects: [() => () => void (torn = true)],
    });

    const store = createStore();
    const unsubscribe = store.sub(state, () => undefined);
    expect(torn).toBe(false);

    unsubscribe();
    expect(torn).toBe(true);
  });

  it("builds a family's effects from its parameter", () => {
    const keys: string[] = [];
    const family = atomFamily<string, string>({
      key: "perParam",
      default: "",
      effects: (param) => [
        ({ setSelf }) => {
          keys.push(param);
          setSelf(`value-for-${param}`);
        },
      ],
    });

    const store = createStore();
    store.sub(family("alpha"), () => undefined);
    store.sub(family("beta"), () => undefined);

    expect(keys).toEqual(["alpha", "beta"]);
    expect(store.get(family("alpha"))).toBe("value-for-alpha");
    expect(store.get(family("beta"))).toBe("value-for-beta");
  });

  it("passes the node so an effect can be written generically", () => {
    let node: unknown;
    const state = atom<number>({
      key: "nodeBearing",
      default: 1,
      effects: [(params) => void (node = params.node)],
    });

    createStore().sub(state, () => undefined);

    expect(node).toBe(state);
  });

  it("accepts a reset through setSelf", () => {
    const state = atom<string>({
      key: "selfReset",
      default: "default",
      effects: [({ setSelf }) => setSelf(DEFAULT_VALUE as DefaultValue)],
    });

    const store = createStore();
    store.sub(state, () => undefined);

    expect(store.get(state)).toBe("default");
  });
});
