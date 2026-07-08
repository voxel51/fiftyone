// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fetchRuns, type VisualizationRun } from "./protocol";
import { useVisualizationRuns } from "./useVisualizationRuns";

vi.mock("./protocol", () => ({ fetchRuns: vi.fn() }));

const run = (brainKey: string): VisualizationRun => ({
  brainKey,
  method: null,
  dims: 2,
  patchesField: null,
  pointsField: null,
  model: null,
  timestamp: null,
});

const RUNS = [run("umap"), run("tsne")];

describe("useVisualizationRuns", () => {
  it("resets to loading when the dataset changes", async () => {
    vi.mocked(fetchRuns).mockResolvedValue(RUNS);
    const { result, rerender } = renderHook(
      ({ dataset }: { dataset: string }) => useVisualizationRuns(dataset),
      { initialProps: { dataset: "ds" } },
    );
    await waitFor(() => expect(result.current.runs).toEqual(RUNS));

    vi.mocked(fetchRuns).mockResolvedValue([]);
    rerender({ dataset: "other" });
    expect(result.current.runs).toBeNull();
    await waitFor(() => expect(result.current.runs).toEqual([]));
  });

  it("reports fetch failures", async () => {
    vi.mocked(fetchRuns).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useVisualizationRuns("ds"));

    await waitFor(() => expect(result.current.error).toMatch("boom"));
    expect(result.current.runs).toBeNull();
  });

  it("does nothing without a dataset", () => {
    vi.mocked(fetchRuns).mockClear();
    const { result } = renderHook(() => useVisualizationRuns(null));

    expect(fetchRuns).not.toHaveBeenCalled();
    expect(result.current.runs).toBeNull();
  });
});
