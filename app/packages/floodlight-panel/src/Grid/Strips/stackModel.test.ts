import { describe, expect, test } from "vitest";
import {
  beginPage,
  clampPosition,
  emptyStack,
  failPage,
  pageToLoad,
  positionLabel,
  receivePage,
  seekStack,
  stackTotal,
  stepStack,
  visibleLayers,
} from "./stackModel";

const items = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: { description: `s${from + i}` },
  }));

const loaded = (count: number, next: number | null = 1) =>
  receivePage(beginPage(emptyStack()), 0, items(0, count), next);

describe("stackModel", () => {
  test("steps forward and back, clamped to the loaded items", () => {
    let state = loaded(10);
    state = stepStack(state, 3);
    expect(state.position).toBe(3);
    state = stepStack(state, -1);
    expect(state.position).toBe(2);
    expect(stepStack(state, 100).position).toBe(9);
    expect(stepStack(state, -100).position).toBe(0);
  });

  test("an empty stack stays at zero", () => {
    expect(stepStack(emptyStack(), 4).position).toBe(0);
    expect(clampPosition(5, 0)).toBe(0);
  });

  test("a step that changes nothing keeps the same state", () => {
    const state = loaded(4);
    expect(stepStack(state, -1)).toBe(state);
  });

  test("requests the first page, then the next one before the end", () => {
    const empty = emptyStack();
    expect(pageToLoad(empty)).toBe(0);
    expect(pageToLoad(beginPage(empty))).toBeNull();

    const state = loaded(20);
    expect(pageToLoad(state, 8)).toBeNull();
    // 19 - 11 = 8 items remain past the front
    expect(pageToLoad(stepStack(state, 11), 8)).toBeNull();
    expect(pageToLoad(stepStack(state, 12), 8)).toBe(1);
  });

  test("stops paging after the last page", () => {
    const state = stepStack(loaded(5, null), 4);
    expect(pageToLoad(state)).toBeNull();
    expect(stackTotal(state)).toBe(5);
    expect(positionLabel(state)).toBe("5 / 5");
  });

  test("ignores a page it is not waiting for", () => {
    const state = loaded(3);
    expect(receivePage(state, 0, items(0, 3), 1)).toBe(state);
    const next = receivePage(beginPage(state), 1, items(3, 2), null);
    expect(next.entries.map((e) => [e.item.id.description, e.page])).toEqual([
      ["s0", 0],
      ["s1", 0],
      ["s2", 0],
      ["s3", 1],
      ["s4", 1],
    ]);
  });

  test("a failed page ends paging", () => {
    const state = failPage(beginPage(loaded(3)));
    expect(state.loading).toBe(false);
    expect(pageToLoad(state)).toBeNull();
  });

  test("shows the front item and up to depth - 1 layers behind it", () => {
    const state = stepStack(loaded(7), 4);
    expect(visibleLayers(state, 5).map((e) => e.item.id.description)).toEqual([
      "s4",
      "s5",
      "s6",
    ]);
    expect(visibleLayers(stepStack(state, -4), 3)).toHaveLength(3);
  });

  test("seeks to a loaded item and ignores unknown ones", () => {
    const state = loaded(10);
    expect(seekStack(state, "s6").position).toBe(6);
    expect(seekStack(state, "missing")).toBe(state);
  });

  test("labels an open-ended stack with a plus", () => {
    expect(positionLabel(stepStack(loaded(20), 2))).toBe("3 / 20+");
    expect(positionLabel(emptyStack())).toBe("0 / 0+");
  });
});
