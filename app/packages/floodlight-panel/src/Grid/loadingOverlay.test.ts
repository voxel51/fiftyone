import { describe, expect, test } from "vitest";
import { showPending, showStorm } from "./loadingOverlay";

const state = {
  building: false,
  everLoaded: true,
  fetching: false,
  interim: false,
};

describe("showStorm", () => {
  test("covers the first load only", () => {
    expect(showStorm({ everLoaded: false })).toBe(true);
    expect(showStorm({ everLoaded: true })).toBe(false);
  });
});

describe("showPending", () => {
  test("shows for a later rebuild that really fetches", () => {
    expect(showPending({ ...state, building: true, fetching: true })).toBe(
      true,
    );
  });

  test("stays hidden during the first load, which has the storm", () => {
    expect(
      showPending({ ...state, building: true, everLoaded: false, fetching: true }),
    ).toBe(false);
  });

  test("stays hidden for a rebuild served from memory", () => {
    expect(showPending({ ...state, building: true })).toBe(false);
  });

  test("stays hidden for a resize's interim builds, even when they fetch", () => {
    expect(
      showPending({ ...state, building: true, fetching: true, interim: true }),
    ).toBe(false);
  });

  test("stays hidden once loaded and idle", () => {
    expect(showPending(state)).toBe(false);
  });
});
