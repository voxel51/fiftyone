/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const trackEvent = vi.fn();
const handlers = new Map<string, (payload?: unknown) => void>();
const state = { surface: null as string | null };

vi.mock("@fiftyone/analytics/src/useTrackEvent", () => ({
  default: () => trackEvent,
}));
vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEventHandler: (
    event: string,
    handler: (payload?: unknown) => void,
  ) => {
    handlers.set(event, handler);
  },
}));
vi.mock("@fiftyone/state", () => ({
  useAnnotationSurface: () => state.surface,
}));

import { useAnnotationTracking } from "./useAnnotationTracking";

describe("useAnnotationTracking", () => {
  beforeEach(() => {
    trackEvent.mockClear();
    handlers.clear();
    state.surface = null;
  });

  it("reports a surface once when it opens", () => {
    const { rerender } = renderHook(() => useAnnotationTracking());
    expect(trackEvent).not.toHaveBeenCalled();

    state.surface = "dgva";
    rerender();
    rerender();
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("ha_surface_opened", {
      surface: "dgva",
    });
  });

  it("tags saves, errors and deletes with the surface", () => {
    state.surface = "3d";
    renderHook(() => useAnnotationTracking());
    trackEvent.mockClear();

    act(() => {
      handlers.get("annotation:persistenceSuccess")?.();
      handlers.get("annotation:persistenceError")?.({});
      handlers.get("annotation:deleteSuccess")?.({ labelType: "Detection" });
      handlers.get("annotation:deleteSuccess")?.({});
    });

    expect(trackEvent.mock.calls).toEqual([
      ["ha_label_saved", { surface: "3d" }],
      ["ha_label_error", { surface: "3d" }],
      ["ha_label_deleted", { surface: "3d", label_type: "Detection" }],
      ["ha_label_deleted", { surface: "3d" }],
    ]);
  });
});
