import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINE_WIDTHS_EVENT } from "../constants";
import { useAnnounceLineWidths } from "./use-announce-line-widths";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@fiftyone/events", () => ({
  getEventBus: () => ({ dispatch }),
}));

describe("useAnnounceLineWidths", () => {
  beforeEach(() => dispatch.mockClear());

  it("reports the main panel's widths as they change", () => {
    const { rerender } = renderHook(
      ({ cuboid, polyline }) => useAnnounceLineWidths(cuboid, polyline, true),
      { initialProps: { cuboid: 3, polyline: 3 } },
    );
    rerender({ cuboid: 0, polyline: 3 });
    rerender({ cuboid: 0, polyline: 3 });

    expect(dispatch.mock.calls).toEqual([
      [LINE_WIDTHS_EVENT, { cuboid: 3, polyline: 3 }],
      [LINE_WIDTHS_EVENT, { cuboid: 0, polyline: 3 }],
    ]);
  });

  it("reports nothing from a side panel", () => {
    renderHook(() => useAnnounceLineWidths(3, 3, false));

    expect(dispatch).not.toHaveBeenCalled();
  });
});
