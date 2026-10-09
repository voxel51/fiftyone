/**
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import useRefreshers from "./useRefreshers";

const values = new Map<unknown, unknown>();

vi.mock("@fiftyone/relay", () => ({ subscribe: () => () => undefined }));
vi.mock("@fiftyone/reverb", () => ({
  useReverbValue: (state: unknown) => values.get(state),
}));
vi.mock("@fiftyone/state", () => {
  const key = (name: string) => name;
  return {
    cropToContent: () => "crop",
    datasetId: key("datasetId"),
    datasetName: key("datasetName"),
    extendedStagesUnsorted: key("stages"),
    fieldVisibilityStage: key("visibility"),
    filterView: (view: unknown) => JSON.stringify(view),
    filters: key("filters"),
    gridScrubCursor: () => "scrub",
    gridSortBy: key("sort"),
    groupSlice: key("slice"),
    queryPerformanceSetting: key("qp"),
    refresher: key("refresher"),
    selectedMediaField: () => "media",
    shouldRenderImaVidLooker: () => "imavid",
    similarityParameters: key("similarity"),
    stringifyObj: (value: unknown) => JSON.stringify(value),
    view: key("view"),
  };
});
vi.mock("./atoms", () => ({ gridAt: 1, gridFraction: 2, gridPage: 3 }));

describe("useRefreshers", () => {
  it("gives a remount the same keys, so it finds the grid it left", () => {
    values.set("datasetName", "quickstart");
    const first = renderHook(() => useRefreshers());
    const keys = first.result.current;
    first.unmount();

    expect(renderHook(() => useRefreshers()).result.current).toEqual(keys);
  });

  it("keeps the items for a new sort and resets them for new data", () => {
    values.set("datasetName", "quickstart");
    const { rerender, result } = renderHook(() => useRefreshers());
    const before = result.current;

    values.set("sort", { field: "uniqueness", descending: false });
    rerender();
    expect(result.current.itemsReset).toBe(before.itemsReset);
    expect(result.current.pageReset).not.toBe(before.pageReset);

    values.set("datasetName", "other");
    rerender();
    expect(result.current.itemsReset).not.toBe(before.itemsReset);
  });
});
