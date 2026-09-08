import { describe, expect, it } from "vitest";
import {
  backgroundClickAction,
  type BackgroundClickAction,
  type WindowOrigin,
} from "./backgroundClick";

describe("backgroundClickAction", () => {
  it.each<
    [string, number | null, WindowOrigin | null, boolean, BackgroundClickAction]
  >([
    ["a lasso selection", 40, "lasso", false, "clear-all"],
    ["a grid selection with no published windows", 3, null, false, "clear-all"],
    ["a legend selection", 12, "legend", false, "clear-all"],
    ["only a legend filter", null, null, true, "reset-legend"],
    ["nothing at all", null, null, false, "none"],
  ])("clears %s", (_label, chipCount, origin, legendFilter, expected) => {
    expect(backgroundClickAction({ chipCount, origin, legendFilter })).toBe(
      expected,
    );
  });

  // A prompt costs a server encode plus a parquet scan, and shares its
  // published slot with the lasso — so the count alone used to read as
  // "there is a selection here to throw away"
  it("never discards a search, however many matches it found", () => {
    expect(
      backgroundClickAction({
        chipCount: 1284,
        origin: "search",
        legendFilter: false,
      }),
    ).toBe("none");
  });

  it("still drops the legend filter while a search stands", () => {
    expect(
      backgroundClickAction({
        chipCount: 1284,
        origin: "search",
        legendFilter: true,
      }),
    ).toBe("reset-legend");
  });
});
