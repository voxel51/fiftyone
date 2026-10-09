/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import { createSampleNavigator } from "./sampleNavigator";

// three pages of three: a0 a1 a2 | b0 b1 b2 | c0 c1 c2
const PAGES = ["a", "b", "c"];
const get = vi.fn(async (key: number) => ({
  items: [0, 1, 2].map((i) => `${PAGES[key]}${i}`),
  next: key < PAGES.length - 1 ? key + 1 : null,
  previous: key > 0 ? key - 1 : null,
}));

describe("createSampleNavigator", () => {
  it("steps within a page and across page boundaries", async () => {
    const navigator = createSampleNavigator({ at: { key: 0, index: 1 }, get });
    expect(await navigator.step(1)).toBe("a2");
    expect(await navigator.step(1)).toBe("b0");
    expect(await navigator.step(-2)).toBe("a1");
    expect(await navigator.step(5)).toBe("c0");
  });

  it("stops at either end", async () => {
    const navigator = createSampleNavigator({ at: { key: 2, index: 2 }, get });
    expect(await navigator.step(1)).toBeUndefined();
    expect(await navigator.peek(-8)).toBe("a0");
    expect(await navigator.peek(-9)).toBeUndefined();
    // a failed step leaves the position where it was
    expect(await navigator.step(-1)).toBe("c1");
  });

  it("peeks without moving, and fetches each page once", async () => {
    get.mockClear();
    const navigator = createSampleNavigator({ at: { key: 1, index: 0 }, get });
    expect(await navigator.peek(-1)).toBe("a2");
    expect(await navigator.peek(-1)).toBe("a2");
    expect(await navigator.step(1)).toBe("b1");
    expect(get.mock.calls.map(([key]) => key)).toEqual([1, 0]);
  });
});
