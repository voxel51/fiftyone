// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SelectionType } from "@fiftyone/state";
import { fetchLassoStage, fetchSampleInfo, idAt } from "./protocol";
import type { SampleInfo } from "./protocol";
import type { Loaded } from "./useRunColumns";
import {
  useSelectionBridge,
  type SelectionBridgeOptions,
} from "./useSelectionBridge";

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: () => {
    throw new Error("network use in a unit test");
  },
}));
vi.mock("./protocol", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./protocol")>()),
  fetchLassoStage: vi.fn(),
  fetchSampleInfo: vi.fn(),
}));

// Two real 12-byte ObjectIds in wire order
const IDS = new Uint8Array(24).map((_, i) => i);
const LOADED: Loaded = {
  brainKey: "viz",
  points: [
    { id: idAt(IDS, 0), x: 0, y: 0, label: null },
    { id: idAt(IDS, 1), x: 1, y: 1, label: null },
  ],
  ids: IDS,
  total: 2,
};

const options = (
  overrides: Partial<SelectionBridgeOptions> = {},
): SelectionBridgeOptions => ({
  datasetName: "ds",
  brainKey: "viz",
  view: [],
  loaded: LOADED,
  patchesField: null,
  chart: { current: { resetCamera: vi.fn(), clearSelection: vi.fn() } },
  setOverrideStage: vi.fn(),
  resetExtended: vi.fn(),
  selectedSamples: new Map<string, SelectionType>(),
  setSelectedSamples: vi.fn(),
  ...overrides,
});

describe("useSelectionBridge", () => {
  it("resolves a lasso polygon to a view stage on the grid", async () => {
    vi.mocked(fetchLassoStage).mockResolvedValue({
      _cls: "fiftyone.core.stages.GeoWithin",
      kwargs: { boundary: [] },
      count: 2,
    });
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    const polygon: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    act(() => result.current.handleSelection([0, 1], polygon));

    await waitFor(() =>
      expect(opts.setOverrideStage).toHaveBeenCalledWith({
        "fiftyone.core.stages.GeoWithin": { boundary: [] },
      }),
    );
    expect(fetchLassoStage).toHaveBeenCalledWith("ds", "viz", [], { polygon });
  });

  it("falls back to indices when no data polygon exists", async () => {
    vi.mocked(fetchLassoStage).mockClear().mockResolvedValue({
      _cls: "fiftyone.core.stages.Select",
      kwargs: {},
      count: 1,
    });
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.handleSelection([1], null));

    await waitFor(() => expect(fetchLassoStage).toHaveBeenCalled());
    expect(fetchLassoStage).toHaveBeenCalledWith("ds", "viz", [], {
      indices: [1],
    });
  });

  it("treats an empty lasso as a selection reset", () => {
    vi.mocked(fetchLassoStage).mockClear();
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.handleSelection([]));

    expect(opts.resetExtended).toHaveBeenCalled();
    expect(fetchLassoStage).not.toHaveBeenCalled();
  });

  it("toggles a sample on plain click", () => {
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() =>
      result.current.handlePointClick({
        index: 0,
        id: "sample0",
        label: "",
        x: 0,
        y: 0,
      }),
    );

    const updater = vi.mocked(opts.setSelectedSamples).mock.calls[0][0] as (
      current: Map<string, SelectionType>,
    ) => Map<string, SelectionType>;
    expect(updater(new Map())).toEqual(new Map([["sample0", "default"]]));
    expect(updater(new Map([["sample0", "default" as SelectionType]]))).toEqual(
      new Map(),
    );
  });

  it("resolves the owning sample for patches runs before toggling", async () => {
    vi.mocked(fetchSampleInfo).mockResolvedValue({
      id: "label7",
      sampleId: "sample7",
      filepath: null,
      media: null,
      value: null,
    } satisfies SampleInfo);
    const opts = options({ patchesField: "ground_truth" });
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() =>
      result.current.handlePointClick({
        index: 7,
        id: "label7",
        label: "",
        x: 0,
        y: 0,
      }),
    );

    await waitFor(() => expect(opts.setSelectedSamples).toHaveBeenCalled());
    expect(fetchSampleInfo).toHaveBeenCalledWith("ds", "viz", 7, null);
    const updater = vi.mocked(opts.setSelectedSamples).mock.calls[0][0] as (
      current: Map<string, SelectionType>,
    ) => Map<string, SelectionType>;
    expect(updater(new Map()).has("sample7")).toBe(true);
  });

  it("maps grid-selected ids to wire indices for the plot", () => {
    const selected = new Map<string, SelectionType>([
      [idAt(IDS, 1), "default"],
      ["not-in-this-run", "default"],
    ]);
    const opts = options({ selectedSamples: selected });
    const { result } = renderHook(() => useSelectionBridge(opts));

    expect(result.current.selectedIndices).toEqual([1]);
  });

  it("reports no plot styling without a grid selection", () => {
    const { result } = renderHook(() => useSelectionBridge(options()));
    expect(result.current.selectedIndices).toBeNull();
  });

  it("tracks the lasso's point count for chrome, until cleared", async () => {
    vi.mocked(fetchLassoStage).mockClear().mockResolvedValue({
      _cls: "fiftyone.core.stages.GeoWithin",
      kwargs: {},
      count: 42,
    });
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));
    expect(result.current.selectionCount).toBeNull();

    act(() =>
      result.current.handleSelection(
        [0, 1],
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ),
    );
    await waitFor(() => expect(result.current.selectionCount).toBe(42));

    act(() => result.current.clearAll());
    expect(result.current.selectionCount).toBeNull();
  });

  it("clears every selection layer on Escape", () => {
    const opts = options();
    renderHook(() => useSelectionBridge(opts));

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(opts.resetExtended).toHaveBeenCalled();
    expect(opts.setSelectedSamples).toHaveBeenCalledWith(new Map());
    expect(opts.chart.current?.clearSelection).toHaveBeenCalled();
  });
});
