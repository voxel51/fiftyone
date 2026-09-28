import { describe, expect, it } from "vitest";
import { foldWindow } from "./fold";

describe("foldWindow", () => {
  const items = Array.from({ length: 380 }, (_, index) => index);

  it("renders everything up to the threshold", () => {
    expect(foldWindow(items.slice(0, 100), 0)).toEqual({
      head: items.slice(0, 100),
      hidden: 0,
      tail: [],
    });
    expect(foldWindow(items.slice(0, 101), 0).hidden).toBe(1);
  });

  it("keeps both ends and counts the middle", () => {
    const window = foldWindow(items, 0);
    expect(window.head).toEqual(items.slice(0, 50));
    expect(window.tail).toEqual(items.slice(330));
    expect(window.hidden).toBe(280);
  });

  it("reveals both ends symmetrically and unfolds once nothing is hidden", () => {
    const window = foldWindow(items, 50);
    expect(window.head).toHaveLength(100);
    expect(window.tail).toHaveLength(100);
    expect(window.hidden).toBe(180);
    expect(foldWindow(items, 200)).toEqual({
      head: items,
      hidden: 0,
      tail: [],
    });
  });
});
