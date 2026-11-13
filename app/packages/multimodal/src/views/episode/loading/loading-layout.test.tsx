import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeModalLayout } from "../layout/layout-persistence";
import {
  loadingPanes,
  publishLoadingLayout,
  useLoadingLayout,
} from "./loading-layout";

const identity = {
  datasetId: "loading-layout-test",
  mediaField: "filepath",
  sampleId: "a",
};
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("loading layout geometry", () => {
  it("keeps saved split percentages, sidebar width, and expanded pane", () => {
    const layout = {
      direction: "row" as const,
      splitPercentage: 70,
      first: "3d-1",
      second: {
        direction: "column" as const,
        splitPercentage: 25,
        first: "image-1",
        second: "image-2",
      },
    };
    writeModalLayout(
      {
        layout,
        sidebarWidthPx: 420.6,
        leftSidebarOpen: false,
        timelineTracksOpen: true,
      },
      identity.datasetId,
    );
    const { result, unmount } = renderHook(() => useLoadingLayout(identity));
    expect(result.current.leftWidth).toBe(421);
    expect(result.current.leftOpen).toBe(false);
    expect(result.current.tracksOpen).toBe(true);
    expect(loadingPanes(result.current.layout)).toEqual([
      { id: "3d-1", left: 0, top: 0, width: 70, height: 100 },
      {
        id: "image-1",
        left: 70,
        top: 0,
        width: 30.000000000000004,
        height: 25,
      },
      {
        id: "image-2",
        left: 70,
        top: 25,
        width: 30.000000000000004,
        height: 75,
      },
    ]);
    unmount();
    writeModalLayout({ expandedTileId: "image-2" }, identity.datasetId);
    const expanded = renderHook(() => useLoadingLayout(identity));
    expect(loadingPanes(expanded.result.current.layout)).toEqual([
      { id: "image-2", left: 0, top: 0, width: 100, height: 100 },
    ]);
  });
  it("uses known destination inventory and places the matching camera poster", () => {
    publishLoadingLayout(
      identity,
      [
        { id: "front", sourceName: "/front", label: "Front", type: "image" },
        { id: "rear", sourceName: "/rear", label: "Rear", type: "image" },
      ],
      undefined,
      "/rear",
    );
    const { result } = renderHook(() => useLoadingLayout(identity));
    expect(result.current.posterTileId).toBe("image-2");
    expect(result.current.titles["image-2"]).toBe("Rear");
    const other = renderHook(() =>
      useLoadingLayout({ ...identity, sampleId: "b", datasetId: "other" }),
    );
    expect(other.result.current.layout).toBeNull();
  });

  it.each(["image-1", undefined, null] as const)(
    "ignores a stale expanded tile with saved layout %s",
    (layout) => {
      const destination = {
        ...identity,
        datasetId: `stale-expanded-${String(layout)}`,
      };
      publishLoadingLayout(destination, [
        { id: "front", sourceName: "/front", label: "Front", type: "image" },
      ]);
      writeModalLayout(
        { layout, expandedTileId: "removed-tile" },
        destination.datasetId,
      );

      const { result } = renderHook(() => useLoadingLayout(destination));
      expect(result.current.layout).toBe(layout === null ? null : "image-1");
    },
  );
});
