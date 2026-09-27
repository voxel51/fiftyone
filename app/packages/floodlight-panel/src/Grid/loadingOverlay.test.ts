import { describe, expect, test } from "vitest";
import { showStorm } from "./loadingOverlay";

const state = {
  building: false,
  everLoaded: true,
  fetching: false,
  interim: false,
  scrubbing: false,
};

describe("showStorm", () => {
  test("covers the grid until the first instance loads", () => {
    expect(showStorm({ ...state, everLoaded: false })).toBe(true);
  });

  test("covers a rebuild that really fetches", () => {
    expect(showStorm({ ...state, building: true, fetching: true })).toBe(true);
  });

  test("stays hidden for a rebuild served from memory", () => {
    expect(showStorm({ ...state, building: true })).toBe(false);
  });

  test("stays hidden for a resize's interim builds, even when they fetch", () => {
    expect(
      showStorm({ ...state, building: true, fetching: true, interim: true }),
    ).toBe(false);
  });

  test("covers the grid while scrubbing", () => {
    expect(showStorm({ ...state, scrubbing: true })).toBe(true);
  });

  test("stays hidden once loaded and idle", () => {
    expect(showStorm(state)).toBe(false);
  });
});
