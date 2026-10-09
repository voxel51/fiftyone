/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createLocationStore, LocationProvider } from "@fiftyone/location";
import { memoryHarness } from "@fiftyone/location/src/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../location/routes";

let landed: () => void = () => undefined;
let departed: () => void = () => undefined;
const endClose = vi.fn();
const transition = {
  open: (_: unknown, open: () => unknown) => open(),
  land: () => new Promise<void>((resolve) => (landed = resolve)),
  settle: vi.fn(),
  beginClose: vi.fn(() => endClose),
  depart: vi.fn(() => new Promise<void>((resolve) => (departed = resolve))),
  afterClose: (run: () => void) => run(),
};
vi.mock("./context", () => ({ useAppSampleTransition: () => transition }));
vi.mock("@fiftyone/state", () => ({
  getSessionRef: () => ({ modalSelector: { id: "a" } }),
}));

const { default: useSamplePage } = await import("./useSamplePage");

const mount = (href: string) => {
  const harness = memoryHarness(href);
  const store = createLocationStore(harness.adapter, appRoutes);
  const page = document.createElement("div");
  const hook = renderHook(
    () => {
      const result = useSamplePage();
      // the page layer is mounted whenever the phase is not "grid"
      (result.ref as { current: HTMLDivElement | null }).current =
        result.phase === "grid" ? null : page;
      return result;
    },
    {
      wrapper: ({ children }) => (
        <LocationProvider store={store}>{children}</LocationProvider>
      ),
    },
  );
  return { harness, hook };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSamplePage", () => {
  it("starts a cold link on the page, with nothing behind it", () => {
    const { hook } = mount("/datasets/d/samples/a");
    expect(hook.result.current.phase).toBe("open");
  });

  it("lands the tile, then reveals the page, then drops the App", async () => {
    const { harness, hook } = mount("/datasets/d");
    expect(hook.result.current.phase).toBe("grid");

    act(() => harness.adapter.push("/datasets/d/samples/a"));
    expect(hook.result.current.phase).toBe("opening");
    expect(transition.settle).toHaveBeenCalledTimes(0);

    act(() => landed());
    await waitFor(() => expect(hook.result.current.phase).toBe("open"));
    expect(transition.settle).toHaveBeenCalledTimes(1);
  });

  it("remounts the App, departs, then drops the page and lets the session reset", async () => {
    const { harness, hook } = mount("/datasets/d/samples/a");

    act(() => harness.adapter.push("/datasets/d"));
    expect(hook.result.current.phase).toBe("closing");
    expect(transition.beginClose).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(transition.depart).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        "a",
        expect.any(Function),
      ),
    );
    expect(endClose).toHaveBeenCalledTimes(0);

    act(() => departed());
    await waitFor(() => expect(hook.result.current.phase).toBe("grid"));
    expect(endClose).toHaveBeenCalledTimes(1);
  });

  it("goes straight to the grid when nothing was open", () => {
    const { harness, hook } = mount("/datasets/d?slice=a");
    act(() => harness.adapter.push("/datasets/d?slice=b"));
    expect(hook.result.current.phase).toBe("grid");
    expect(transition.beginClose).toHaveBeenCalledTimes(0);
  });
});
