import { describe, expect, it } from "vitest";
import {
  createPageCursors,
  cursorLinks,
  forgetCursors,
  seekFor,
} from "./pageCursors";

const cursors = () => {
  const value = createPageCursors();
  for (const page of [-2, -1, 0, 1, 2]) {
    value.starts.set(page, `s${page}`);
    value.ends.set(page, `e${page}`);
  }
  return value;
};

describe("seekFor", () => {
  it("seeks a forward page after the previous page's end", () => {
    expect(seekFor(cursors(), 2)).toEqual({ after: "e1" });
  });

  it("seeks a backward page before the next page's start", () => {
    expect(seekFor(cursors(), -2)).toEqual({ before: "s-1" });
  });

  it("falls back to the other neighbor once a page is forgotten", () => {
    const known = cursors();
    forgetCursors(known, 0);
    expect(seekFor(known, 1)).toEqual({ before: "s2" });
    expect(seekFor(known, -1)).toEqual({ after: "e-2" });
  });

  it("leaves the committed cursor alone for page 0", () => {
    expect(seekFor(cursors(), 0)).toBeUndefined();
  });
});

describe("cursorLinks", () => {
  const base = { hasNext: false, hasPrevious: false, originHasPrevious: false };

  it("links a backward seek forward, to the page it came from", () => {
    expect(
      cursorLinks({
        ...base,
        hasPrevious: true,
        page: 3,
        seek: { before: "s" },
      }),
    ).toEqual({ next: 4, previous: 2 });
    expect(cursorLinks({ ...base, page: -3, seek: { before: "s" } })).toEqual({
      next: -2,
      previous: null,
    });
  });

  it("links a forward seek back, to the page it came from", () => {
    expect(
      cursorLinks({ ...base, hasNext: true, page: -3, seek: { after: "e" } }),
    ).toEqual({ next: -2, previous: -4 });
  });

  it("asks the bounds whether the seeked origin has a predecessor", () => {
    expect(
      cursorLinks({
        ...base,
        originHasPrevious: true,
        page: 0,
        seek: undefined,
      }),
    ).toEqual({ next: null, previous: -1 });
  });
});
