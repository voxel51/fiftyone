import { describe, expect, it } from "vitest";
import { listWindow } from "./list";

const items = [0, 100, 200, 300, 400].map((top) => ({ top, height: 90 }));

describe("listWindow", () => {
  it("finds the first showing item and counts the ones in view", () => {
    expect(listWindow(items, 0, 250)).toEqual({ first: 0, visible: 3 });
    expect(listWindow(items, 95, 150)).toEqual({ first: 1, visible: 2 });
    expect(listWindow(items, 150, 100)).toEqual({ first: 1, visible: 2 });
  });

  it("treats an item scrolled just past as gone", () => {
    expect(listWindow(items, 90, 100)).toEqual({ first: 1, visible: 1 });
  });

  it("rests at the start of an empty list", () => {
    expect(listWindow([], 40, 100)).toEqual({ first: 0, visible: 0 });
  });
});
