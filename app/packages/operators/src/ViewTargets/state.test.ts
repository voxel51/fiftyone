import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../state", () => ({
  useViewTargetGroupConstraints: vi.fn(),
  useViewTargetSampleCounts: vi.fn(),
}));

import {
  useViewTargetGroupConstraints,
  useViewTargetSampleCounts,
} from "../state";
import { ViewTarget } from "../types";
import {
  GROUPED_DATASET_TARGET_REASON,
  useViewTargetCounts,
  useViewTargets,
} from "./state";

const mockConstraints = (values: {
  isGroupedDataset?: boolean;
  viewIsFlattened?: boolean;
  slice?: string | null;
}) =>
  vi.mocked(useViewTargetGroupConstraints).mockReturnValue({
    isGroupedDataset: false,
    viewIsFlattened: false,
    slice: null,
    ...values,
  });

describe("useViewTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers every target for ungrouped datasets", () => {
    mockConstraints({});

    const { result } = renderHook(() => useViewTargets({ requireFlat: true }));

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

  it("offers grouped datasets to operations that do not require flat views", () => {
    mockConstraints({ isGroupedDataset: true, slice: "left" });

    const { result } = renderHook(() => useViewTargets());

    expect(
      result.current.targets.every((t) => t.unavailableReason === undefined),
    ).toBe(true);
    expect(result.current.targets[0].description).toBe("Process full dataset");
    expect(result.current.targets[1].description).toBe(
      "Samples matching filters",
    );
    expect(result.current.defaultTarget).toBe("DATASET");
  });

  it("scopes view targets to the active slice for grouped datasets", () => {
    mockConstraints({ isGroupedDataset: true, slice: "left" });

    const { result } = renderHook(() => useViewTargets({ requireFlat: true }));
    const [dataset, currentView, selected] = result.current.targets;

    expect(dataset.unavailableReason).toBe(GROUPED_DATASET_TARGET_REASON);
    expect(currentView.description).toBe(
      "Samples matching filters in the current slice (left)",
    );
    expect(selected.description).toBe(
      "Selected samples in the current slice (left)",
    );
    expect(result.current.defaultTarget).toBe("CURRENT_VIEW");
  });

  it("falls back to generic wording when the active slice is unset", () => {
    mockConstraints({ isGroupedDataset: true, slice: null });

    const { result } = renderHook(() => useViewTargets({ requireFlat: true }));
    const [, currentView, selected] = result.current.targets;

    expect(currentView.description).toBe(
      "Samples matching filters in the current group slice",
    );
    expect(selected.description).toBe(
      "Selected samples in the current group slice",
    );
  });

  it("does not scope views the user already flattened", () => {
    mockConstraints({
      isGroupedDataset: true,
      viewIsFlattened: true,
      slice: "left",
    });

    const { result } = renderHook(() => useViewTargets({ requireFlat: true }));
    const [dataset, currentView] = result.current.targets;

    expect(currentView.description).toBe("Samples matching filters");
    expect(currentView.unavailableReason).toBeUndefined();
    expect(dataset.unavailableReason).toBe(GROUPED_DATASET_TARGET_REASON);
  });
});

describe("useViewTargetCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCounts = (values: {
    datasetSampleCount?: number;
    viewSampleCount?: number;
    selectionSampleCount?: number;
  }) =>
    vi.mocked(useViewTargetSampleCounts).mockReturnValue({
      datasetSampleCount: 0,
      viewSampleCount: 0,
      selectionSampleCount: 0,
      ...values,
    });

  it("counts the dataset for dataset targets", () => {
    mockCounts({ datasetSampleCount: 51, viewSampleCount: 10 });

    const { result } = renderHook(() => useViewTargetCounts());

    expect(result.current[ViewTarget.DATASET]).toBe(51);
    expect(result.current[ViewTarget.DATASET_VIEW]).toBe(51);
  });

  it("counts the selection for the selected samples target", () => {
    mockCounts({ datasetSampleCount: 51, selectionSampleCount: 3 });

    const { result } = renderHook(() => useViewTargetCounts());

    expect(result.current[ViewTarget.SELECTED_SAMPLES]).toBe(3);
  });

  it("counts the current view for every other target", () => {
    mockCounts({ datasetSampleCount: 51, viewSampleCount: 10 });

    const { result } = renderHook(() => useViewTargetCounts());

    expect(result.current[ViewTarget.CURRENT_VIEW]).toBe(10);
    expect(result.current[ViewTarget.BASE_VIEW]).toBe(10);
  });
});
