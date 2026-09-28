import { describe, expect, it } from "vitest";
import {
  clampPage,
  DEFAULT_PAGE_SIZE,
  keyRange,
  normalizeSize,
  PAGE_SIZES,
  pageAfterResize,
  pageCount,
  pageForKey,
  pageOfKey,
} from "./model";

describe("pageCount", () => {
  it("rounds a partial last page up", () => {
    expect(pageCount(113, 20)).toBe(6);
    expect(pageCount(113, 40)).toBe(3);
    expect(pageCount(200, 200)).toBe(1);
    expect(pageCount(201, 200)).toBe(2);
  });

  it("shows one page for an empty view", () => {
    expect(pageCount(0, 40)).toBe(1);
  });
});

describe("keyRange", () => {
  it("spans size / 20 fetch pages per UI page", () => {
    expect(keyRange(0, 20, 20)).toEqual([0, 1]);
    expect(keyRange(3, 20, 20)).toEqual([3, 4]);
    expect(keyRange(0, 40, 20)).toEqual([0, 2]);
    expect(keyRange(2, 100, 20)).toEqual([10, 15]);
    expect(keyRange(1, 200, 20)).toEqual([10, 20]);
  });
});

describe("clampPage", () => {
  it("keeps a page inside [0, count)", () => {
    expect(clampPage(-1, 6)).toBe(0);
    expect(clampPage(6, 6)).toBe(5);
    expect(clampPage(3, 6)).toBe(3);
    expect(clampPage(0, 1)).toBe(0);
  });
});

describe("pageOfKey", () => {
  it("finds the UI page holding a fetch page", () => {
    expect(pageOfKey(0, 40, 20)).toBe(0);
    expect(pageOfKey(1, 40, 20)).toBe(0);
    expect(pageOfKey(2, 40, 20)).toBe(1);
    expect(pageOfKey(14, 100, 20)).toBe(2);
  });

  it("returns to page 1 on a view change's reset anchor", () => {
    expect(pageOfKey(0, 200, 20)).toBe(0);
  });

  it("puts a scrub cursor's negative keys on page 1", () => {
    expect(pageOfKey(-3, 40, 20)).toBe(0);
  });
});

describe("pageAfterResize", () => {
  it("keeps the old page's first item on screen", () => {
    // page 5 of 20 starts at item 100, which is on page 1 of 100
    expect(pageAfterResize(5, 20, 100)).toBe(1);
    // page 1 of 100 starts at item 100, which is page 5 of 20
    expect(pageAfterResize(1, 100, 20)).toBe(5);
    expect(pageAfterResize(0, 40, 200)).toBe(0);
  });
});

describe("normalizeSize", () => {
  it("accepts listed sizes and falls back otherwise", () => {
    expect(PAGE_SIZES).toEqual([20, 40, 100, 200]);
    expect(normalizeSize(100)).toBe(100);
    expect(normalizeSize(30)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeSize(undefined)).toBe(40);
  });
});

describe("pageForKey", () => {
  it("moves one page per PageUp/PageDown, clamped", () => {
    expect(pageForKey("PageDown", 2, 6)).toBe(3);
    expect(pageForKey("PageUp", 2, 6)).toBe(1);
    expect(pageForKey("PageDown", 5, 6)).toBe(5);
    expect(pageForKey("PageUp", 0, 6)).toBe(0);
  });

  it("ignores other keys", () => {
    expect(pageForKey("ArrowDown", 2, 6)).toBeUndefined();
  });
});
