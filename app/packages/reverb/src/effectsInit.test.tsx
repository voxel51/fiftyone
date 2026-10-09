/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { cleanup, render } from "@testing-library/react";
import { createStore } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { atom } from "./atom";
import type { AtomEffect } from "./effects";
import { useReverbValue } from "./hooks";
import { ReverbRoot } from "./root";
import { DEFAULT_VALUE } from "./sentinel";

afterEach(() => cleanup());

const stored = (value: boolean | undefined): AtomEffect<boolean> => {
  const effect: AtomEffect<boolean> = ({ setSelf }) => {
    value !== undefined && setSelf(value);
  };
  effect.seed = () => value;

  return effect;
};

describe("effect seeds", () => {
  it("are what the first render reads", () => {
    const state = atom({
      key: "seededFirstRender",
      default: true,
      effects: [stored(false)],
    });
    const seen: boolean[] = [];
    const Component = () => {
      seen.push(useReverbValue(state));
      return null;
    };

    render(
      <ReverbRoot>
        <Component />
      </ReverbRoot>,
    );

    expect(seen[0]).toBe(false);
  });

  it("leave the default when they have no value", () => {
    const state = atom({
      key: "seededEmpty",
      default: true,
      effects: [stored(undefined)],
    });

    expect(createStore().get(state)).toBe(true);
  });

  it("do not survive a reset", () => {
    const state = atom({
      key: "seededReset",
      default: true,
      effects: [stored(false)],
    });
    const store = createStore();

    expect(store.get(state)).toBe(false);
    store.set(state, DEFAULT_VALUE);
    expect(store.get(state)).toBe(true);
  });
});
