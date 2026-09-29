/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createLocationStore, LocationProvider } from "@fiftyone/location";
import { memoryHarness } from "@fiftyone/location/src/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { appRoutes } from "../location/routes";

let landed: () => void = () => undefined;
const settle = vi.fn();
vi.mock("./transition", () => ({
  createSampleTransition: () => ({
    open: (_: unknown, open: () => unknown) => open(),
    land: () => new Promise<void>((resolve) => (landed = resolve)),
    settle,
  }),
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

describe("useSamplePage", () => {
  it("starts a cold link on the page, with nothing behind it", () => {
    const { hook } = mount("/datasets/d/samples/a");
    expect(hook.result.current.phase).toBe("open");
  });

  it("lands the tile, then reveals the page, then drops the app", async () => {
    const { harness, hook } = mount("/datasets/d");
    expect(hook.result.current.phase).toBe("grid");
    settle.mockClear();

    act(() => harness.adapter.push("/datasets/d/samples/a"));
    expect(hook.result.current.phase).toBe("opening");
    expect(settle).toHaveBeenCalledTimes(0);

    act(() => landed());
    await waitFor(() => expect(hook.result.current.phase).toBe("open"));
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("goes back to the grid when the route leaves the sample", () => {
    const { harness, hook } = mount("/datasets/d/samples/a");
    act(() => harness.adapter.push("/datasets/d"));
    expect(hook.result.current.phase).toBe("grid");
  });
});
