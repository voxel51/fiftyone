import { describe, expect, it } from "vitest";
import { orderBySearchRecency, RECENT_WINDOW_MS } from "./searchIndexRecency";

const keys = (names: string[]) =>
  names.map((key) => ({ key, patchesField: null }));

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

describe("orderBySearchRecency", () => {
  it("keeps newest-created order when nothing was used recently", () => {
    const ordered = orderBySearchRecency(keys(["newest", "older"]), {}, NOW);
    expect(ordered.map((index) => index.key)).toEqual(["newest", "older"]);
  });

  it("puts recently-used indexes first, most recent leading", () => {
    const ordered = orderBySearchRecency(
      keys(["newest", "b", "a", "oldest"]),
      { a: NOW - HOUR, b: NOW - 2 * HOUR },
      NOW,
    );
    expect(ordered.map((index) => index.key)).toEqual([
      "a",
      "b",
      "newest",
      "oldest",
    ]);
  });

  it("a use outside the past week does not count as recent", () => {
    const ordered = orderBySearchRecency(
      keys(["newest", "stale"]),
      { stale: NOW - RECENT_WINDOW_MS - 1 },
      NOW,
    );
    expect(ordered.map((index) => index.key)).toEqual(["newest", "stale"]);
  });

  it("caps the recent block at five, creation order resuming after", () => {
    const names = ["n1", "n2", "u1", "u2", "u3", "u4", "u5", "u6"];
    const uses = Object.fromEntries(
      ["u1", "u2", "u3", "u4", "u5", "u6"].map((key, i) => [
        key,
        NOW - (i + 1) * HOUR,
      ]),
    );
    const ordered = orderBySearchRecency(keys(names), uses, NOW);
    expect(ordered.map((index) => index.key)).toEqual([
      "u1",
      "u2",
      "u3",
      "u4",
      "u5",
      "n1",
      "n2",
      "u6",
    ]);
  });

  it("ignores uses of indexes that no longer exist", () => {
    const ordered = orderBySearchRecency(
      keys(["only"]),
      { ghost: NOW - HOUR },
      NOW,
    );
    expect(ordered.map((index) => index.key)).toEqual(["only"]);
  });
});
