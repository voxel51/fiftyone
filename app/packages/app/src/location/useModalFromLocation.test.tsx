/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createLocationStore, LocationProvider } from "@fiftyone/location";
import { memoryHarness } from "@fiftyone/location/src/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clear = vi.fn();
const open = vi.fn();
const setModalState = vi.fn(() => Promise.resolve());
const session: { modalSelector?: { id?: string; groupId?: string } } = {};
vi.mock("@fiftyone/state", () => ({
  getSessionRef: () => session,
  useClearModal: () => clear,
  useSetExpandedSample: () => open,
  useSetModalState: () => setModalState,
}));

const { default: useModalFromLocation } =
  await import("./useModalFromLocation");

const mount = (href: string) => {
  const harness = memoryHarness(href);
  const store = createLocationStore(harness.adapter, {
    parse: (path: string) => path,
    format: (path: string) => path,
    scopes: () => ({ dataset: "d" }),
  });
  renderHook(() => useModalFromLocation(), {
    wrapper: ({ children }) => (
      <LocationProvider store={store}>{children}</LocationProvider>
    ),
  });
  return harness;
};

beforeEach(() => {
  clear.mockReset();
  open.mockReset();
  setModalState.mockClear();
  session.modalSelector = undefined;
});

describe("useModalFromLocation", () => {
  it("leaves a cold load to the session the server replays", () => {
    mount("/datasets/d?id=a");
    expect(open).toHaveBeenCalledTimes(0);
    expect(clear).toHaveBeenCalledTimes(0);
  });

  it("closes the sample when Back leaves it", () => {
    const harness = mount("/datasets/d");
    act(() => harness.adapter.push("/datasets/d?id=a"));
    session.modalSelector = { id: "a" };
    act(() => harness.back());
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("opens the sample Forward lands on", async () => {
    const harness = mount("/datasets/d");
    act(() => harness.adapter.push("/datasets/d?groupId=g"));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ groupId: "g" }));
    expect(setModalState).toHaveBeenCalledTimes(1);
  });

  it("leaves the session alone when the App made the move", () => {
    const harness = mount("/datasets/d");
    session.modalSelector = { groupId: "g", id: "a" };
    act(() => harness.adapter.push("/datasets/d?groupId=g"));
    expect(open).toHaveBeenCalledTimes(0);
    expect(clear).toHaveBeenCalledTimes(0);
  });
});
