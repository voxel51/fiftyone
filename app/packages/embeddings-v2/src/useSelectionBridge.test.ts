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
  chart: {
    current: {
      resetCamera: vi.fn(),
      clearSelection: vi.fn(),
      projectPoint: vi.fn(() => null),
    },
  },
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

  it.each([
    // The resolver can decline a gesture it doesn't know how to build (e.g.
    // no stored points field) — that must still fall through to the server
    ["the resolver declines even though fully loaded", () => null],
    // No client-side resolver at all: the stage must come from the server
    ["no resolver exists", null],
  ])("falls back to the server when %s", async (_name, resolver) => {
    vi.mocked(fetchLassoStage)
      .mockClear()
      .mockResolvedValue({
        _cls: "fiftyone.core.stages.Select",
        kwargs: { sample_ids: [idAt(IDS, 0)], ordered: false },
        count: 1,
      });
    const opts = options({
      pointsField: "embedding",
      resolveLassoStage: resolver,
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
          // Derived from the returned Select stage — the server route
          // reports samples too when the stage enumerates them
          sampleCount: 1,
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

    // ONE publish carrying stage AND count: Chrome reads the count, and a
    // separate publish would invalidate the App's view twice per gesture
    expect(opts.publishSelection).toHaveBeenCalledTimes(1);
    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: {
          "fiftyone.core.stages.Select": {
            sample_ids: [idAt(IDS, 1)],
            ordered: false,
          },
        },
        count: 1,
        // A Select stage enumerates its samples, so the sample count is
        // knowable client-side
        sampleCount: 1,
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
          // A spatial stage only the server can enumerate: the sample
          // count is unknowable and the UI falls back to points
          sampleCount: null,
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
    // No client-side resolver: the stage must come from the server route
    const opts = options({ resolveLassoStage: null });
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
    // The grid filter clears in the same gesture: resetting only the
    // extended selection would leave a stale stage narrowing the grid
    expect(opts.publishSelection).toHaveBeenCalledWith({
      stage: null,
      count: null,
      sampleCount: null,
      decorate: null,
    });
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

  it("scopes the grid to a clicked sample without ticking its checkbox", () => {
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() =>
      result.current.handlePointClick({
        index: 0,
        id: idAt(IDS, 0),
        label: "",
        x: 0,
        y: 0,
      }),
    );

    // The checkboxes mark samples for an action taken on them; a reader
    // browsing the plot has chosen nothing yet
    expect(opts.setSelectedSamples).not.toHaveBeenCalled();
    expect(opts.publishSelection).toHaveBeenCalledWith({
      stage: {
        "fiftyone.core.stages.Select": {
          sample_ids: [idAt(IDS, 0)],
          ordered: false,
        },
      },
      count: 1,
      sampleCount: 1,
      decorate: null,
    });
  });

  it("lights the clicked point in the plot with no checkbox behind it", () => {
    // `selectedSamples` never sees the click, so the plot's emphasis has to
    // come from the click layer itself
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() =>
      result.current.handlePointClick({
        index: 1,
        id: idAt(IDS, 1),
        label: "",
        x: 0,
        y: 0,
      }),
    );

    expect(result.current.selectedIndices).toEqual([1]);
  });

  it("lights a clicked point alongside the grid's own selection", () => {
    const opts = options({
      selectedSamples: new Map([[idAt(IDS, 0), "default" as SelectionType]]),
    });
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() =>
      result.current.handlePointClick({
        index: 1,
        id: idAt(IDS, 1),
        label: "",
        x: 0,
        y: 0,
      }),
    );

    expect(result.current.selectedIndices).toEqual([0, 1]);
  });

  it("replaces a lasso's stage when a point is clicked", () => {
    // A click scopes the grid in its own right; it is not a pick inside
    // whatever the lasso left standing
    const opts = options({ pointsField: "embedding" });
    const { result } = renderHook(() => useSelectionBridge(opts));

    const polygon: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    act(() => result.current.handleSelection([0, 1], polygon));
    act(() =>
      result.current.handlePointClick({
        index: 0,
        id: idAt(IDS, 0),
        label: "",
        x: 0,
        y: 0,
      }),
    );

    const published = vi.mocked(opts.publishSelection).mock.calls;
    expect(published[0][0].stage).toHaveProperty("fiftyone.core.stages.Mongo");
    expect(published[1][0].stage).toEqual({
      "fiftyone.core.stages.Select": {
        sample_ids: [idAt(IDS, 0)],
        ordered: false,
      },
    });
  });

  it("starts a fresh click scope after a lasso supersedes the last one", () => {
    // The lasso replaced the click layer's stage, so the points it scoped
    // away must not come back in the next click's Select stage
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    const click = (index: number) =>
      act(() =>
        result.current.handlePointClick({
          index,
          id: idAt(IDS, index),
          label: "",
          x: 0,
          y: 0,
        }),
      );

    click(0);
    act(() => result.current.handleSelection([0, 1], null));
    click(1);

    expect(result.current.lassoIndices).toBeNull();
    expect(result.current.selectedIndices).toEqual([1]);
    expect(opts.publishSelection).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stage: {
          "fiftyone.core.stages.Select": {
            sample_ids: [idAt(IDS, 1)],
            ordered: false,
          },
        },
      }),
    );
  });

  it("selects the clicked POINT, not every point its sample owns", () => {
    // An episode owns every window of itself, so lighting all of them for a
    // click on one moment filled the whole episode's timeline — the reader
    // chose one window and the grid should say so
    const idsWithDuplicate = new Uint8Array(36);
    idsWithDuplicate.set(IDS.subarray(0, 12), 0); // point 0: id 0
    idsWithDuplicate.set(IDS.subarray(12, 24), 12); // point 1: id 1
    idsWithDuplicate.set(IDS.subarray(0, 12), 24); // point 2: id 0 again
    const loaded: Loaded = {
      ...LOADED,
      points: [
        { id: idAt(idsWithDuplicate, 0), x: 0, y: 0, label: null },
        { id: idAt(idsWithDuplicate, 1), x: 1, y: 1, label: null },
        { id: idAt(idsWithDuplicate, 2), x: 2, y: 2, label: null },
      ],
      ids: idsWithDuplicate,
      total: 3,
    };
    const decorator = vi.fn();
    const decorateSelection = vi.fn(() => decorator);
    const opts = options({ loaded, decorateSelection });
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() =>
      result.current.handlePointClick({
        index: 0,
        id: idAt(IDS, 0),
        label: "",
        x: 0,
        y: 0,
      }),
    );

    // Point 2 shares the clicked sample's id and is deliberately NOT lit
    expect(decorateSelection).toHaveBeenCalledWith([0]);
    // One point, one sample — the counts the chip and the pill read
    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1, sampleCount: 1 }),
    );
  });

  it("adds a second clicked point of the same sample", () => {
    // Two windows of one episode are two moments the reader picked out, not
    // a second click undoing the first
    const idsWithDuplicate = new Uint8Array(36);
    idsWithDuplicate.set(IDS.subarray(0, 12), 0);
    idsWithDuplicate.set(IDS.subarray(12, 24), 12);
    idsWithDuplicate.set(IDS.subarray(0, 12), 24);
    const loaded: Loaded = {
      ...LOADED,
      points: [
        { id: idAt(idsWithDuplicate, 0), x: 0, y: 0, label: null },
        { id: idAt(idsWithDuplicate, 1), x: 1, y: 1, label: null },
        { id: idAt(idsWithDuplicate, 2), x: 2, y: 2, label: null },
      ],
      ids: idsWithDuplicate,
      total: 3,
    };
    const decorator = vi.fn();
    const decorateSelection = vi.fn(() => decorator);
    const opts = options({ loaded, decorateSelection });
    const { result } = renderHook(() => useSelectionBridge(opts));

    const click = (index: number) =>
      act(() =>
        result.current.handlePointClick({
          index,
          id: idAt(IDS, 0),
          label: "",
          x: 0,
          y: 0,
        }),
      );

    click(0);
    click(2);
    expect(decorateSelection).toHaveBeenLastCalledWith([0, 2]);

    // ...and clicking one of them again takes just that one back
    click(0);
    expect(decorateSelection).toHaveBeenLastCalledWith([2]);
  });

  it("clears the sample once its last clicked point is taken back", () => {
    const decorateSelection = vi.fn(() => vi.fn());
    const opts = options({ decorateSelection });
    // The decorator is built from `null`, which is what clears the overlays
    const { result } = renderHook(() => useSelectionBridge(opts));

    const click = () =>
      act(() =>
        result.current.handlePointClick({
          index: 0,
          id: idAt(IDS, 0),
          label: "",
          x: 0,
          y: 0,
        }),
      );

    click();
    click();

    expect(decorateSelection).toHaveBeenLastCalledWith(null);
    // Nothing is scoped any more, so the stage goes with the counts
    expect(opts.resetExtended).toHaveBeenCalled();
    expect(opts.publishSelection).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: null, count: null, sampleCount: null }),
    );
    expect(result.current.selectedIndices).toBeNull();
  });

  it("accumulates a second click's sample into the same scope", () => {
    // Each click rebuilds from the clicks before it, so a second one must
    // widen the scope rather than replace it
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    const click = (index: number) =>
      act(() =>
        result.current.handlePointClick({
          index,
          id: idAt(IDS, index),
          label: "",
          x: 0,
          y: 0,
        }),
      );

    click(0);
    click(1);

    expect(opts.publishSelection).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stage: {
          "fiftyone.core.stages.Select": {
            sample_ids: [idAt(IDS, 0), idAt(IDS, 1)],
            ordered: false,
          },
        },
        count: 2,
        sampleCount: 2,
      }),
    );
  });

  it("scopes to a grid-selected sample rather than unticking it", () => {
    // The checkbox was the reader's choice; a click on the same sample says
    // "show me this one", which is no reason to take that choice away
    const opts = options({
      selectedSamples: new Map([[idAt(IDS, 0), "default" as SelectionType]]),
    });
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() =>
      result.current.handlePointClick({
        index: 0,
        id: idAt(IDS, 0),
        label: "",
        x: 0,
        y: 0,
      }),
    );

    expect(opts.setSelectedSamples).not.toHaveBeenCalled();
    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: {
          "fiftyone.core.stages.Select": {
            sample_ids: [idAt(IDS, 0)],
            ordered: false,
          },
        },
        count: 1,
        sampleCount: 1,
      }),
    );
  });

  it("drops a patches click that a clear superseded while it resolved", async () => {
    let settle: (info: SampleInfo) => void = () => undefined;
    vi.mocked(fetchSampleInfo).mockReturnValue(
      new Promise<SampleInfo>((resolve) => {
        settle = resolve;
      }),
    );
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
    // The reader gives up on the click before the server answers
    act(() => result.current.clearAll());
    vi.mocked(opts.publishSelection).mockClear();

    await act(async () => {
      settle({
        id: "label7",
        sampleId: "sample7",
        filepath: null,
        media: null,
        value: null,
      } satisfies SampleInfo);
    });

    // Restoring it here would resurrect a selection that was deliberately
    // dropped, with no gesture to explain it
    expect(opts.publishSelection).not.toHaveBeenCalled();
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

    await waitFor(() => expect(opts.publishSelection).toHaveBeenCalled());
    expect(fetchSampleInfo).toHaveBeenCalledWith("ds", "viz", 7, null);
    // The label's OWNING sample scopes the grid — a Select stage cannot
    // speak label ids
    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: {
          "fiftyone.core.stages.Select": {
            sample_ids: ["sample7"],
            ordered: false,
          },
        },
      }),
    );
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

  it("styles every point sharing a grid-selected id, not just one", () => {
    // Points 0 and 2 share one sample (episode) id, e.g. two windows of
    // the same episode in a multimodal run. Both must stay undimmed.
    const idsWithDuplicate = new Uint8Array(36);
    idsWithDuplicate.set(IDS.subarray(0, 12), 0); // point 0: id 0
    idsWithDuplicate.set(IDS.subarray(12, 24), 12); // point 1: id 1
    idsWithDuplicate.set(IDS.subarray(0, 12), 24); // point 2: id 0 again
    const loaded: Loaded = {
      ...LOADED,
      points: [
        { id: idAt(idsWithDuplicate, 0), x: 0, y: 0, label: null },
        { id: idAt(idsWithDuplicate, 1), x: 1, y: 1, label: null },
        { id: idAt(idsWithDuplicate, 2), x: 2, y: 2, label: null },
      ],
      ids: idsWithDuplicate,
      total: 3,
    };
    const selected = new Map<string, SelectionType>([
      [idAt(IDS, 0), "default"],
    ]);
    const opts = options({ loaded, selectedSamples: selected });
    const { result } = renderHook(() => useSelectionBridge(opts));

    expect(result.current.selectedIndices).toEqual([0, 2]);
  });

  it("resolves a selection whose one id owns 200k points without overflowing", () => {
    // Spread-pushing the matched indices used to RangeError past the
    // engine's argument limit (~65-125k); one episode id can own that
    // many window-points in a multimodal run
    const total = 200_000;
    const ids = new Uint8Array(total * 12);
    for (let i = 0; i < total; i++) ids.set(IDS.subarray(0, 12), i * 12);
    const loaded: Loaded = {
      ...LOADED,
      points: new Array(total).fill({
        id: idAt(IDS, 0),
        x: 0,
        y: 0,
        label: null,
      }),
      ids,
      total,
    };
    const selected = new Map<string, SelectionType>([
      [idAt(IDS, 0), "default"],
    ]);
    const opts = options({ loaded, selectedSamples: selected });
    const { result } = renderHook(() => useSelectionBridge(opts));

    expect(result.current.selectedIndices).toHaveLength(total);
    expect(result.current.selectedIndices?.[total - 1]).toBe(total - 1);
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
      sampleCount: null,
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

  it("reports distinct samples when a lasso's stage repeats an id", () => {
    // Points 0 and 2 share one sample (two windows of an episode), so the
    // resolver's Select stage carries that id twice. The pill reports
    // samples, so occurrences must not be counted as two samples
    const idsWithDuplicate = new Uint8Array(36);
    idsWithDuplicate.set(IDS.subarray(0, 12), 0); // point 0: id 0
    idsWithDuplicate.set(IDS.subarray(12, 24), 12); // point 1: id 1
    idsWithDuplicate.set(IDS.subarray(0, 12), 24); // point 2: id 0 again
    const loaded: Loaded = {
      ...LOADED,
      points: [
        { id: idAt(idsWithDuplicate, 0), x: 0, y: 0, label: null },
        { id: idAt(idsWithDuplicate, 1), x: 1, y: 1, label: null },
        { id: idAt(idsWithDuplicate, 2), x: 2, y: 2, label: null },
      ],
      ids: idsWithDuplicate,
      total: 3,
    };
    const opts = options({ loaded });
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.handleSelection([0, 1, 2], null));

    expect(opts.publishSelection).toHaveBeenCalledWith(
      expect.objectContaining({ count: 3, sampleCount: 2 }),
    );
  });

  it("drops the lasso's legend scope when a click supersedes it", () => {
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.handleSelection([0, 1], null));
    expect(Array.from(result.current.lassoIndices ?? [])).toEqual([0, 1]);

    act(() =>
      result.current.handlePointClick({
        index: 0,
        id: idAt(IDS, 0),
        label: "",
        x: 0,
        y: 0,
      }),
    );

    // The click's artifacts replaced the lasso's, so the legend must scope
    // to the click, never the stale lasso
    expect(result.current.lassoIndices).toBeNull();
  });

  it("drops the lasso's legend scope when a click deselects to empty", () => {
    const opts = options();
    const { result } = renderHook(() => useSelectionBridge(opts));

    const click = () =>
      act(() =>
        result.current.handlePointClick({
          index: 0,
          id: idAt(IDS, 0),
          label: "",
          x: 0,
          y: 0,
        }),
      );

    click();
    act(() => result.current.handleSelection([0, 1], null));
    expect(result.current.lassoIndices).not.toBeNull();

    // Two clicks on one point select it and take it back, publishing an
    // empty selection; a surviving lasso scope would keep the legend
    // claiming a selection
    click();
    click();

    expect(result.current.lassoIndices).toBeNull();
    expect(opts.publishSelection).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: null, count: null }),
    );
  });

  it("ignores a lasso response that arrives after a click", async () => {
    let resolveLasso: (v: {
      _cls: string;
      kwargs: Record<string, unknown>;
      count: number;
    }) => void = () => undefined;
    vi.mocked(fetchLassoStage)
      .mockClear()
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveLasso = resolve)),
      );
    // Partially loaded, so the lasso resolves server-side (and can be slow)
    const opts = options({ loaded: { ...LOADED, total: 5 } });
    const { result } = renderHook(() => useSelectionBridge(opts));

    act(() => result.current.handleSelection([0], null));
    act(() =>
      result.current.handlePointClick({
        index: 1,
        id: idAt(IDS, 1),
        label: "",
        x: 0,
        y: 0,
      }),
    );

    await act(async () => {
      resolveLasso({ _cls: "S", kwargs: {}, count: 1 });
    });

    // Only the click published; the late lasso response was orphaned, so
    // the click's stage is the one the grid is left with
    expect(opts.publishSelection).toHaveBeenCalledTimes(1);
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
  });

  it("keeps both samples when two patches clicks overlap in flight", async () => {
    // Each patches click resolves its label to a sample asynchronously; two
    // rapid clicks overlap, and the resolutions can even land out of order.
    // Both toggles must accumulate rather than the later one rebuilding
    // from the selection as it stood before the earlier one applied.
    const pending: Array<(info: SampleInfo) => void> = [];
    vi.mocked(fetchSampleInfo)
      .mockClear()
      .mockImplementation(
        () => new Promise<SampleInfo>((resolve) => pending.push(resolve)),
      );
    const info = (n: number): SampleInfo => ({
      id: `label${n}`,
      sampleId: `sample${n}`,
      filepath: null,
      media: null,
      value: null,
    });
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
    act(() =>
      result.current.handlePointClick({
        index: 8,
        id: "label8",
        label: "",
        x: 0,
        y: 0,
      }),
    );

    // Resolve out of order: the second click's sample lands first
    await act(async () => {
      pending[1](info(8));
    });
    await act(async () => {
      pending[0](info(7));
    });

    await waitFor(() => expect(opts.publishSelection).toHaveBeenCalledTimes(2));
    const lastPublish = vi.mocked(opts.publishSelection).mock.calls.at(-1)?.[0];
    const stage = lastPublish?.stage?.["fiftyone.core.stages.Select"] as
      | { sample_ids: string[] }
      | undefined;
    expect(new Set(stage?.sample_ids)).toEqual(new Set(["sample7", "sample8"]));
    expect(lastPublish?.sampleCount).toBe(2);
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
