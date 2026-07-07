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
  it("loads runs and defaults the key to the first run", async () => {
    vi.mocked(fetchRuns).mockResolvedValue(RUNS);
    const setBrainKey = vi.fn();
    const { result, rerender } = renderHook(
      ({ brainKey }: { brainKey: string | null }) =>
        useVisualizationRuns("ds", brainKey, setBrainKey),
      { initialProps: { brainKey: null as string | null } },
    );

    await waitFor(() => expect(result.current.runs).toEqual(RUNS));
    expect(setBrainKey).toHaveBeenCalledWith("umap");

    // The caller owns the key; once it lands, the run resolves
    rerender({ brainKey: "umap" });
    expect(result.current.run).toEqual(RUNS[0]);
  });

  it("keeps an existing valid key", async () => {
    vi.mocked(fetchRuns).mockResolvedValue(RUNS);
    const setBrainKey = vi.fn();
    const { result } = renderHook(() =>
      useVisualizationRuns("ds", "tsne", setBrainKey),
    );

    await waitFor(() => expect(result.current.run).toEqual(RUNS[1]));
    expect(setBrainKey).not.toHaveBeenCalled();
  });

  it("re-defaults a key that is not in the list", async () => {
    vi.mocked(fetchRuns).mockResolvedValue(RUNS);
    const setBrainKey = vi.fn();
    renderHook(() => useVisualizationRuns("ds", "deleted_run", setBrainKey));

    await waitFor(() => expect(setBrainKey).toHaveBeenCalledWith("umap"));
  });

  it("reports fetch failures", async () => {
    vi.mocked(fetchRuns).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useVisualizationRuns("ds", null, vi.fn()),
    );

    await waitFor(() => expect(result.current.error).toMatch("boom"));
    expect(result.current.runs).toBeNull();
  });

  it("does nothing without a dataset", () => {
    vi.mocked(fetchRuns).mockClear();
    const { result } = renderHook(() =>
      useVisualizationRuns(null, null, vi.fn()),
    );

    expect(fetchRuns).not.toHaveBeenCalled();
    expect(result.current.runs).toBeNull();
  });
});
