/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createLocationStore, LocationProvider } from "@fiftyone/location";
import { memoryHarness } from "@fiftyone/location/src/testing";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setSlice = vi.fn();
const session = { sessionGroupSlice: "left" as string | undefined };
vi.mock("@fiftyone/state", () => ({
  getSessionRef: () => session,
  useSetGroupSlice: () => setSlice,
}));

const { default: useSliceFromLocation } =
  await import("./useSliceFromLocation");

const mount = (href: string) => {
  const harness = memoryHarness(href);
  const store = createLocationStore(harness.adapter, {
    parse: (path: string) => path,
    format: (path: string) => path,
    scopes: () => ({ dataset: "d" }),
  });
  renderHook(() => useSliceFromLocation(), {
    wrapper: ({ children }) => (
      <LocationProvider store={store}>{children}</LocationProvider>
    ),
  });
  return harness;
};

beforeEach(() => {
  setSlice.mockReset();
  session.sessionGroupSlice = "left";
});

describe("useSliceFromLocation", () => {
  it("leaves the session alone when the URL agrees with it", () => {
    mount("/datasets/d?slice=left");
    expect(setSlice).toHaveBeenCalledTimes(0);
  });

  it("applies a slice the URL moved to without the App, such as Back", () => {
    const harness = mount("/datasets/d?slice=left");
    act(() => harness.adapter.push("/datasets/d?slice=right"));

    expect(setSlice).toHaveBeenCalledTimes(1);
    expect(setSlice).toHaveBeenCalledWith("right");
  });
});
