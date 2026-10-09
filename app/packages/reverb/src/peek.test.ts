/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { atom } from "./atom";
import { selector } from "./selector";
import { peekReverbValue } from "./unstable";

describe("peekReverbValue", () => {
  it("never computes state nothing subscribes to", () => {
    const get = vi.fn(() => 1);
    const counted = selector<number>({ key: "peek/unmounted", get });

    expect(peekReverbValue(createStore(), counted)).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it("reads a subscribed state's current value", () => {
    const store = createStore();
    const base = atom({ key: "peek/base", default: 2 });
    const doubled = selector<number>({
      key: "peek/doubled",
      get: ({ get }) => get(base) * 2,
    });
    const unsubscribe = store.sub(doubled, () => undefined);

    expect(peekReverbValue(store, doubled)?.valueMaybe()).toBe(4);
    store.set(base, 3);
    expect(peekReverbValue(store, doubled)?.valueMaybe()).toBe(6);

    unsubscribe();
    expect(peekReverbValue(store, doubled)).toBeUndefined();
  });

  it("is loading while a subscribed state is pending, then settled", async () => {
    const store = createStore();
    let resolve: (value: number) => void = () => undefined;
    const pending = selector<Promise<number>>({
      key: "peek/pending",
      get: () => new Promise<number>((done) => (resolve = done)),
    });
    store.sub(pending, () => undefined);

    expect(peekReverbValue(store, pending)?.state).toBe("loading");
    resolve(5);
    await Promise.resolve();
    await Promise.resolve();
    expect(peekReverbValue(store, pending)?.valueMaybe()).toBe(5);
  });
});
