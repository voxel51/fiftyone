// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SelectionType } from "@fiftyone/state";
import type { LassoStageInput } from "./extensions";
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

// The extension's client-side resolver, as the tests need it: a spatial
// stage for a polygon over a stored points field, else an id stage
const resolveLassoStage = ({
  indices,
  polygon,
  ids,
  pointsField,
}: LassoStageInput): Record<string, unknown> | null => {
  if (polygon?.length && pointsField) {
    return {
      "fiftyone.core.stages.Mongo": {
        pipeline: [
          { $match: { [pointsField]: { $geoWithin: { $polygon: polygon } } } },
        ],
      },
    };
  }
  return {
    "fiftyone.core.stages.Select": {
      sample_ids: indices.map((index) => idAt(ids, index)),
      ordered: false,
    },
  };
};

const options = (
  overrides: Partial<SelectionBridgeOptions> = {},
): SelectionBridgeOptions => ({
  datasetName: "ds",
  brainKey: "viz",
  view: [],
  loaded: LOADED,
  patchesField: null,
  pointsField: null,
  visible: null,
  chart: { current: { resetCamera: vi.fn(), clearSelection: vi.fn() } },
  // Stage, decoration and count land in ONE transaction, so a lasso
  // invalidates the App's view once instead of once per setter
  publishSelection: vi.fn(),
  resetExtended: vi.fn(),
  selectedSamples: new Map<string, SelectionType>(),
  setSelectedSamples: vi.fn(),
  decorateSelection: null,
  resolveLassoStage,
  ...overrides,
});

describe("useSelectionBridge", () => {
  it("builds a spatial stage client-side when fully loaded", () => {
    // Every point is loaded, so the hit-test is complete: the gesture
    // resolves to a $geoWithin stage locally with no server round trip
    vi.mocked(fetchLassoStage).mockClear();
    const opts = options({ pointsField: "embedding" });
    const { result } = renderHook(() => useSelectionBridge(opts));

    const polygon: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    act(() => result.current.handleSelection([0, 1], polygon));

    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: {
          "fiftyone.core.stages.Mongo": {
            pipeline: [
              { $match: { embedding: { $geoWithin: { $polygon: polygon } } } },
            ],
          },
        },
      }),
    );
    expect(fetchLassoStage).not.toHaveBeenCalled();
  });

  it("falls back to the server when the resolver declines even though fully loaded", async () => {
    // The resolver can decline a gesture it doesn't know how to build (e.g. no
    // stored points field) — that must still fall through to the server route
    vi.mocked(fetchLassoStage)
      .mockClear()
      .mockResolvedValue({
        _cls: "fiftyone.core.stages.Select",
        kwargs: { sample_ids: [idAt(IDS, 0)], ordered: false },
        count: 1,
      });
    const opts = options({
      pointsField: "embedding",
      resolveLassoStage: () => null,
    });
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.handleSelection([0], null));

    await waitFor(() =>
      expect(opts.publishSelection).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: {
            "fiftyone.core.stages.Select": {
              sample_ids: [idAt(IDS, 0)],
              ordered: false,
            },
          },
        }),
      ),
    );
    expect(fetchLassoStage).toHaveBeenCalledWith("ds", "viz", [], {
      indices: [0],
    });
  });

  it("selects only visible points, skipping the spatial shortcut, when filtered", () => {
    // point 0 passes the filter, point 1 is hidden
    vi.mocked(fetchLassoStage).mockClear();
    const opts = options({
      pointsField: "embedding",
      visible: new Uint8Array([1, 0]),
    });
    const { result } = renderHook(() => useSelectionBridge(opts));

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

    // Only the visible point survives, resolved by id (not $geoWithin)
    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: {
          "fiftyone.core.stages.Select": {
            sample_ids: [idAt(IDS, 0)],
            ordered: false,
          },
        },
      }),
    );
    expect(fetchLassoStage).not.toHaveBeenCalled();
  });

  it("builds an id stage client-side from indices when no polygon", () => {
    vi.mocked(fetchLassoStage).mockClear();
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.handleSelection([1], null));

    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: {
          "fiftyone.core.stages.Select": {
            sample_ids: [idAt(IDS, 1)],
            ordered: false,
          },
        },
      }),
    );
    expect(fetchLassoStage).not.toHaveBeenCalled();
  });

  it("falls back to the server for a mid-load gesture", async () => {
    // Fewer points loaded than the run holds: the client hit-test is
    // incomplete, so the server resolves the polygon against the full run
    vi.mocked(fetchLassoStage)
      .mockClear()
      .mockResolvedValue({
        _cls: "fiftyone.core.stages.GeoWithin",
        kwargs: { boundary: [] },
        count: 2,
      });
    const opts = options({ loaded: { ...LOADED, total: 5 } });
    const { result } = renderHook(() => useSelectionBridge(opts));

    const polygon: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    act(() => result.current.handleSelection([0, 1], polygon));

    await waitFor(() =>
      expect(opts.publishSelection).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: { "fiftyone.core.stages.GeoWithin": { boundary: [] } },
        }),
      ),
    );
    expect(fetchLassoStage).toHaveBeenCalledWith("ds", "viz", [], { polygon });
  });

  // The legend counts follow the gesture, not the network: the
  // lasso's indices surface synchronously, and every clear path
  // (empty gesture, clearAll) drops them
  it("exposes lasso indices synchronously and clears them", () => {
    vi.mocked(fetchLassoStage)
      .mockClear()
      .mockResolvedValue({ _cls: "s", kwargs: {}, count: 2 });
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    expect(result.current.lassoIndices).toBeNull();
    act(() => result.current.handleSelection([0, 1]));
    // Available before the stage round trip resolves; typed array
    // because a lasso can enclose millions of points
    expect(Array.from(result.current.lassoIndices ?? [])).toEqual([0, 1]);

    act(() => result.current.handleSelection([]));
    expect(result.current.lassoIndices).toBeNull();

    act(() => result.current.handleSelection([1]));
    expect(Array.from(result.current.lassoIndices ?? [])).toEqual([1]);
    act(() => result.current.clearAll());
    expect(result.current.lassoIndices).toBeNull();
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

  // Responses must apply in request order: a slow first lasso resolving
  // after a quick second one used to overwrite the newer selection
  it("ignores a lasso response that arrives after a newer lasso", async () => {
    const stage = (count: number) => ({
      _cls: "S",
      kwargs: { n: count },
      count,
    });
    let resolveFirst: (v: ReturnType<typeof stage>) => void = () => undefined;
    vi.mocked(fetchLassoStage)
      .mockClear()
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(stage(2));
    // Partially loaded, so both gestures resolve server-side
    const opts = options({ loaded: { ...LOADED, total: 5 } });
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.handleSelection([0], null));
    act(() => result.current.handleSelection([0, 1], null));
    await waitFor(() =>
      expect(opts.publishSelection).toHaveBeenCalledWith(
        expect.objectContaining({ stage: { S: { n: 2 } }, count: 2 }),
      ),
    );

    await act(async () => {
      resolveFirst(stage(1));
    });
    // The newer selection stands: the late loser publishes nothing
    expect(opts.publishSelection).toHaveBeenCalledTimes(1);
  });

  // A failure banner describes the gesture that failed; it must not
  // linger over a newer pending lasso or survive an explicit clear
  it("drops a stale failure banner when a new lasso begins", async () => {
    vi.mocked(fetchLassoStage)
      .mockClear()
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementationOnce(() => new Promise(() => undefined));
    // Partially loaded, so the gesture resolves server-side and can fail
    const { result } = renderHook(() =>
      useSelectionBridge(options({ loaded: { ...LOADED, total: 5 } })),
    );

    act(() => result.current.handleSelection([0], null));
    await waitFor(() => expect(result.current.error).toMatch("boom"));

    act(() => result.current.handleSelection([0, 1], null));
    expect(result.current.error).toBeNull();
  });

  it("clears a failure banner on clearAll", async () => {
    vi.mocked(fetchLassoStage)
      .mockClear()
      .mockRejectedValueOnce(new Error("boom"));
    // Partially loaded, so the gesture resolves server-side and can fail
    const { result } = renderHook(() =>
      useSelectionBridge(options({ loaded: { ...LOADED, total: 5 } })),
    );

    act(() => result.current.handleSelection([0], null));
    await waitFor(() => expect(result.current.error).toMatch("boom"));

    act(() => result.current.clearAll());
    expect(result.current.error).toBeNull();
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

  it("treats a selection that maps to nothing as no selection", () => {
    // Sample ids never resolve against a patches run's label-id wire
    // order. An empty array here would dim the whole plot and outrank
    // the filter-match layer in the host's precedence chain
    const selected = new Map<string, SelectionType>([
      ["not-in-this-run", "default"],
    ]);
    const opts = options({ selectedSamples: selected });
    const { result } = renderHook(() => useSelectionBridge(opts));

    expect(result.current.selectedIndices).toBeNull();
  });

  it("publishes the lasso's point count in the same transaction as its stage", () => {
    // Chrome reads the count; publishing it separately would invalidate the
    // App's view a second time for one gesture
    vi.mocked(fetchLassoStage).mockClear();
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

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

    expect(opts.publishSelection).toHaveBeenCalledTimes(1);
    // Client-side resolution counts the selected points directly
    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2 }),
    );
  });

  it("drops every overlay when the selection is cleared", () => {
    // The count clears in the same transaction as the indices: it is what the
    // chip and the panel tab's pill both read, so a stale one keeps claiming
    // a selection that no longer exists
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.clearAll());

    expect(opts.resetExtended).toHaveBeenCalled();
    expect(opts.publishSelection).toHaveBeenCalledWith({
      stage: null,
      count: null,
      decorate: null,
    });
  });

  it("decorates the publish with the kept points' artifacts", () => {
    // The decoration is the extension's to build; the bridge hands it exactly
    // the surviving (visible) points and its decorator joins the same
    // transaction as the stage. Point 0 is hidden, so only 1 survives
    const decorator = vi.fn();
    const decorateSelection = vi.fn(() => decorator);
    const opts = options({
      decorateSelection,
      visible: new Uint8Array([0, 1]),
    });
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.handleSelection([0, 1], null));

    expect(decorateSelection).toHaveBeenCalledWith([1]);
    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({ decorate: decorator }),
    );
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
