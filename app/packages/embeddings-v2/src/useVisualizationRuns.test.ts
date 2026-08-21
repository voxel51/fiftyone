// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVisualizationRuns } from "./useVisualizationRuns";

const dataset = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@fiftyone/state", () => ({ dataset: "datasetAtom" }));
vi.mock("recoil", () => ({ useRecoilValue: () => dataset.current }));

const brainRun = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  timestamp: "2026-07-22T04:31:25",
  ready: true,
  config: {
    cls: "fiftyone.brain.visualization.UMAPVisualizationConfig",
    method: "umap",
    numDims: 2,
    patchesField: null,
    pointsField: null,
    model: null,
    ...over,
  },
});

describe("useVisualizationRuns", () => {
  it("reads the runs off the dataset the page already loaded", () => {
    // The dataset query carries brainMethods, so listing them costs no request
    dataset.current = { brainMethods: [brainRun("umap"), brainRun("tsne")] };
    const { result } = renderHook(() => useVisualizationRuns());

    expect(result.current.runs?.map((r) => r.brainKey)).toEqual([
      "umap",
      "tsne",
    ]);
    expect(result.current.runs?.[0]).toMatchObject({
      method: "umap",
      dims: 2,
      ready: true,
    });
  });

  it("offers only visualization runs", () => {
    // A dataset's brain methods also hold similarity indexes and whatever
    // else brain wrote; a plot can open none of them
    dataset.current = {
      brainMethods: [
        brainRun("umap"),
        brainRun("sim", {
          cls: "fiftyone.brain.similarity.SimilarityConfig",
        }),
      ],
    };
    const { result } = renderHook(() => useVisualizationRuns());

    expect(result.current.runs?.map((r) => r.brainKey)).toEqual(["umap"]);
  });

  it("reports a run whose results are not saved as not ready", () => {
    dataset.current = {
      brainMethods: [{ ...brainRun("umap"), ready: false }],
    };
    const { result } = renderHook(() => useVisualizationRuns());

    expect(result.current.runs?.[0].ready).toBe(false);
  });

  it("is null only until the dataset resolves", () => {
    dataset.current = null;
    const { result } = renderHook(() => useVisualizationRuns());

    expect(result.current.runs).toBeNull();
  });

  it("has no runs for a dataset that has never been visualized", () => {
    dataset.current = { brainMethods: [] };
    const { result } = renderHook(() => useVisualizationRuns());

    expect(result.current.runs).toEqual([]);
  });
});
