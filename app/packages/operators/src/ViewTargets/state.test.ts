import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// the module's selectors are registered at import time, so their get callbacks
// are captured here to be exercised directly
const { selectorGetters } = vi.hoisted(() => ({
  selectorGetters: new Map<string, (opts: { get: unknown }) => unknown>(),
}));

vi.mock("recoil", () => ({
  selector: vi.fn((options) => {
    selectorGetters.set(options.key, options.get);
    return { key: options.key };
  }),
  useRecoilValue: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  isGroup: { key: "isGroup" },
  parentMediaTypeSelector: { key: "parentMediaTypeSelector" },
  viewSelectsGroupSlices: { key: "viewSelectsGroupSlices" },
  groupSlice: { key: "groupSlice" },
  datasetSampleCount: { key: "datasetSampleCount" },
  selectedSamples: { key: "selectedSamples" },
  hasGroupSlices: { key: "hasGroupSlices" },
  groupStatistics: vi.fn(),
  aggregation: vi.fn(),
  count: vi.fn(),
}));

import { ViewTarget } from "../types";
import {
  GROUPED_DATASET_TARGET_REASON,
  useGetViewTargetCount,
  useViewTargets,
} from "./state";

const mockState = async (values: Record<string, unknown>) => {
  const { useRecoilValue } = await import("recoil");
  vi.mocked(useRecoilValue).mockImplementation(
    (atom: { key: string }) => values[atom.key],
  );
};

describe("useViewTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers every target for ungrouped datasets", async () => {
    await mockState({ isGroup: false, parentMediaTypeSelector: "image" });

    const { result } = renderHook(() => useViewTargets());

    expect(result.current.targets.map((t) => t.target)).toStrictEqual([
      "DATASET",
      "CURRENT_VIEW",
      "SELECTED_SAMPLES",
    ]);
    expect(
      result.current.targets.every((t) => t.unavailableReason === undefined),
    ).toBe(true);
    expect(result.current.targets[1].description).toBe(
      "Samples matching filters",
    );
    expect(result.current.defaultTarget).toBe("DATASET");
  });

  it("scopes view targets to the active slice for grouped datasets", async () => {
    await mockState({
      isGroup: true,
      viewSelectsGroupSlices: false,
      groupSlice: "left",
    });

    const { result } = renderHook(() => useViewTargets());
    const [dataset, currentView, selected] = result.current.targets;

    // the dataset spans every slice, so it cannot be flattened for the run
    expect(dataset.unavailableReason).toBe(GROUPED_DATASET_TARGET_REASON);
    expect(currentView.description).toBe(
      "Samples matching filters in the current slice (left)",
    );
    expect(selected.description).toBe(
      "Selected samples in the current slice (left)",
    );
    expect(result.current.defaultTarget).toBe("CURRENT_VIEW");
  });

  it("does not scope views that select their own slices", async () => {
    await mockState({
      isGroup: false,
      parentMediaTypeSelector: "group",
      viewSelectsGroupSlices: true,
      groupSlice: "left",
    });

    const { result } = renderHook(() => useViewTargets());
    const [dataset, currentView] = result.current.targets;

    expect(currentView.description).toBe("Samples matching filters");
    // the dataset itself remains grouped
    expect(dataset.unavailableReason).toBe(GROUPED_DATASET_TARGET_REASON);
  });

  it("keeps the current view available when it selects its own slices", async () => {
    // the backend uses such a view as-is, so it is a valid target
    await mockState({
      isGroup: true,
      viewSelectsGroupSlices: true,
      groupSlice: "left",
    });

    const { result } = renderHook(() => useViewTargets());
    const [dataset, currentView, selected] = result.current.targets;

    expect(dataset.unavailableReason).toBe(GROUPED_DATASET_TARGET_REASON);
    expect(currentView.unavailableReason).toBeUndefined();
    expect(selected.unavailableReason).toBeUndefined();
    expect(result.current.defaultTarget).toBe("CURRENT_VIEW");
  });
});

describe("useGetViewTargetCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCounts = async ({
    datasetSampleCount = 0,
    selected = new Set<string>(),
    viewSampleCount = 0,
  }: {
    datasetSampleCount?: number;
    selected?: Set<string>;
    viewSampleCount?: number;
  }) =>
    mockState({
      datasetSampleCount,
      selectedSamples: selected,
      viewTargetCurrentViewSampleCount: viewSampleCount,
    });

  it("counts the dataset for dataset targets", async () => {
    await mockCounts({ datasetSampleCount: 51, viewSampleCount: 10 });

    const { result } = renderHook(() => useGetViewTargetCount());

    expect(result.current(ViewTarget.DATASET)).toBe(51);
    expect(result.current(ViewTarget.DATASET_VIEW)).toBe(51);
  });

  it("counts the selection for the selected samples target", async () => {
    await mockCounts({
      datasetSampleCount: 51,
      selected: new Set(["a", "b", "c"]),
    });

    const { result } = renderHook(() => useGetViewTargetCount());

    expect(result.current(ViewTarget.SELECTED_SAMPLES)).toBe(3);
  });

  it("counts the current view for every other target", async () => {
    await mockCounts({ datasetSampleCount: 51, viewSampleCount: 10 });

    const { result } = renderHook(() => useGetViewTargetCount());

    expect(result.current(ViewTarget.CURRENT_VIEW)).toBe(10);
    expect(result.current(ViewTarget.BASE_VIEW)).toBe(10);
  });
});

describe("currentViewSampleCount", () => {
  const AGGREGATION = { key: "aggregation" };
  const COUNT = { key: "count" };
  const GROUP_STATISTICS = { key: "groupStatistics" };

  const getCount = async (values: Record<string, unknown>) => {
    const fos = await import("@fiftyone/state");
    // the mocked selector families stand in for recoil nodes, so the
    // returned stubs are only used as keys into `values`
    vi.mocked(fos.aggregation).mockReturnValue(AGGREGATION as never);
    vi.mocked(fos.count).mockReturnValue(COUNT as never);
    vi.mocked(fos.groupStatistics).mockReturnValue(GROUP_STATISTICS as never);

    const get = selectorGetters.get("viewTargetCurrentViewSampleCount");
    return get({ get: (atom: { key: string }) => values[atom.key] });
  };

  it("reads the active slice count for grouped datasets", async () => {
    expect(
      await getCount({
        hasGroupSlices: true,
        viewSelectsGroupSlices: false,
        groupStatistics: "group",
        aggregation: { __typename: "RootAggregation", slice: 7, count: 21 },
      }),
    ).toBe(7);
  });

  it("reads the flattened count when group statistics are off", async () => {
    expect(
      await getCount({
        hasGroupSlices: true,
        viewSelectsGroupSlices: false,
        groupStatistics: "slice",
        aggregation: { __typename: "RootAggregation", slice: 7, count: 21 },
      }),
    ).toBe(21);
  });

  it("counts views that select their own slices like any other view", async () => {
    expect(
      await getCount({
        hasGroupSlices: true,
        viewSelectsGroupSlices: true,
        count: 13,
      }),
    ).toBe(13);
  });

  it("counts ungrouped datasets with the shared count selector", async () => {
    expect(await getCount({ hasGroupSlices: false, count: 13 })).toBe(13);
  });

  it("counts nothing when the aggregation has not resolved", async () => {
    expect(
      await getCount({
        hasGroupSlices: true,
        viewSelectsGroupSlices: false,
        aggregation: undefined,
      }),
    ).toBe(0);
  });
});
