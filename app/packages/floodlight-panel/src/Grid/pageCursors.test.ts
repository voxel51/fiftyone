import { describe, expect, it } from "vitest";
import paginateSamplesQuery from "@fiftyone/relay/src/queries/__generated__/paginateSamplesQuery.graphql";
import {
  createPageCursors,
  MAX_CURSOR_PAGES,
  pageLinks,
  pageRequest,
  pageSequence,
  pageWindow,
  rememberCursors,
  requestVariables,
} from "./pageCursors";

const known = (...pages: number[]) => {
  const cursors = createPageCursors();
  for (const page of pages) {
    rememberCursors(cursors, page, {
      startCursor: `s${page}`,
      endCursor: `e${page}`,
    });
  }
  return cursors;
};

const request = (
  key: number,
  mode: "SMALL" | "INDEXED" | "SCROLL",
  cursors = known(),
  seek?: { fraction: number },
) => pageRequest({ cursors, key, mode, pageSize: 20, seek });

describe("pageRequest from a seek origin", () => {
  const seek = { fraction: 0.4 };

  it("fetches key 0 at the seek", () => {
    expect(request(0, "INDEXED", known(), seek)).toEqual({ seek });
  });

  it("chains forward after the end cursor of the key before", () => {
    expect(request(1, "INDEXED", known(0), seek)).toEqual({ after: "e0" });
    expect(request(2, "INDEXED", known(0, 1), seek)).toEqual({ after: "e1" });
  });

  it("chains backward before the start cursor of the key after", () => {
    expect(request(-1, "INDEXED", known(0), seek)).toEqual({ before: "s0" });
    expect(request(-2, "INDEXED", known(-1), seek)).toEqual({
      before: "s-1",
    });
  });

  it("falls back to the other neighbor once one is unknown", () => {
    expect(request(1, "INDEXED", known(2), seek)).toEqual({ before: "s2" });
    expect(request(-1, "INDEXED", known(-2), seek)).toEqual({ after: "e-2" });
  });

  it("addresses nothing without a known neighbor", () => {
    expect(request(5, "INDEXED", known(0), seek)).toBeUndefined();
  });
});

describe("pageRequest by mode", () => {
  it("starts every order at its start without a seek", () => {
    for (const mode of ["SMALL", "INDEXED", "SCROLL"] as const) {
      expect(request(0, mode)).toEqual({ after: null });
    }
  });

  it("never seeks a SCROLL order", () => {
    expect(request(0, "SCROLL", known(), { fraction: 0.5 })).toEqual({
      after: null,
    });
    expect(request(3, "SCROLL")).toBeUndefined();
    expect(request(-1, "SCROLL", known(0))).toBeUndefined();
  });

  it("addresses any SMALL key by offset when its neighbors are unknown", () => {
    expect(request(7, "SMALL")).toEqual({ seek: { offset: 140 } });
    expect(request(7, "SMALL", known(6))).toEqual({ after: "e6" });
  });

  it("has nothing before the start of an order without a seek", () => {
    expect(request(-1, "SMALL", known(0))).toBeUndefined();
    expect(request(-1, "INDEXED", known(0))).toBeUndefined();
  });
});

describe("pageLinks", () => {
  const flags = (hasNext: boolean, hasPrevious: boolean) => ({
    hasNext,
    hasPrevious,
  });

  it("links the start of an order forward only", () => {
    expect(pageLinks(0, { after: null }, flags(true, false))).toEqual({
      next: 1,
      previous: null,
    });
  });

  it("links a page after a cursor back to the page it followed", () => {
    expect(pageLinks(3, { after: "e2" }, flags(false, true))).toEqual({
      next: null,
      previous: 2,
    });
  });

  it("links a page before a cursor forward to the page it preceded", () => {
    expect(pageLinks(-2, { before: "s-1" }, flags(false, false))).toEqual({
      next: -1,
      previous: null,
    });
  });

  it("links a seek page both ways as the server reports", () => {
    const seek = { seek: { fraction: 0.5 } };
    expect(pageLinks(0, seek, flags(true, true))).toEqual({
      next: 1,
      previous: -1,
    });
    expect(pageLinks(0, seek, flags(true, false)).previous).toBeNull();
  });
});

describe("pageSequence", () => {
  it("numbers forward pages from their key", () => {
    expect(pageSequence(2, { after: "e1" }, 20, 20)(3)).toBe(43);
  });

  it("ends a short backward page where the next page starts", () => {
    const at = pageSequence(-1, { before: "s0" }, 20, 5);
    expect([at(0), at(4)]).toEqual([-5, -1]);
  });
});

describe("cursors", () => {
  it("keeps a bounded number of pages", () => {
    const cursors = createPageCursors();
    for (let page = 0; page < MAX_CURSOR_PAGES + 10; page++) {
      rememberCursors(cursors, page, { startCursor: "s", endCursor: "e" });
    }
    expect(cursors.starts.size).toBe(MAX_CURSOR_PAGES);
    expect(cursors.ends.size).toBe(MAX_CURSOR_PAGES);
    expect(cursors.ends.has(0)).toBe(false);
  });

  it("maps a request onto the query's variables", () => {
    expect(requestVariables({ before: "s0" })).toEqual({
      after: null,
      before: "s0",
      seek: null,
    });
    expect(requestVariables({ seek: { offset: 40 } }).seek).toEqual({
      offset: 40,
    });
  });
});

describe("pageWindow", () => {
  it("sizes the page by a variable the query declares", () => {
    const declared = new Set(
      paginateSamplesQuery.fragment.argumentDefinitions.map(({ name }) => name),
    );
    const window = pageWindow(2, 50);
    for (const name of Object.keys(window)) expect(declared).toContain(name);
    expect(window).toEqual({ after: "99", count: 50 });
    expect(pageWindow(0, 50).after).toBeNull();
  });
});
