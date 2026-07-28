// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fetchRuns, type VisualizationRun } from "./protocol";
import { PENDING_POLL_MS, useVisualizationRuns } from "./useVisualizationRuns";

vi.mock("./protocol", () => ({ fetchRuns: vi.fn() }));

const run = (brainKey: string): VisualizationRun => ({
  brainKey,
  method: null,
  dims: 2,
  patchesField: null,
  pointsField: null,
  model: null,
  ready: true,
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

  // A run without results must flip to ready without a page reload —
  // and the poll must stop the moment nothing is pending
  it("polls while any run is pending, then stops", async () => {
    vi.useFakeTimers();
    try {
      const pending = { ...run("umap"), ready: false };
      vi.mocked(fetchRuns).mockClear();
      vi.mocked(fetchRuns).mockResolvedValue([pending]);
      const { result } = renderHook(() => useVisualizationRuns("ds"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.runs).toEqual([pending]);

      vi.mocked(fetchRuns).mockClear();
      vi.mocked(fetchRuns).mockResolvedValue([run("umap")]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PENDING_POLL_MS);
      });
      expect(fetchRuns).toHaveBeenCalledTimes(1);
      expect(result.current.runs).toEqual([run("umap")]);

      // Everything ready: no further ticks
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PENDING_POLL_MS * 3);
      });
      expect(fetchRuns).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
