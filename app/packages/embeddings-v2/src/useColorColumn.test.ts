// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  fetchColor,
  fetchColorByChoices,
  type ColorResponse,
  type VisualizationRun,
} from "./protocol";
import { useColorColumn, usePointColors } from "./useColorColumn";
import type { PlotPalette } from "./colors";

vi.mock("./protocol", () => ({
  fetchColorByChoices: vi.fn(),
  fetchColor: vi.fn(),
}));

const PALETTE: PlotPalette = {
  classes: ["#ff0000", "#00ff00"],
  ramp: [
    [0, 0, 0],
    [255, 255, 255],
  ],
};

/** The pair as PlotView composes it: the column, then its rgb */
const useColumnWithColors = (
  datasetName: string | null,
  brainKey: string | null,
  run: VisualizationRun | null,
  colorField: string | null,
) => {
  const column = useColorColumn(datasetName, brainKey, run, colorField);
  return {
    ...column,
    colors: usePointColors(column.values, column.meta, PALETTE),
  };
};

const RUN: VisualizationRun = {
  brainKey: "viz",
  method: null,
  dims: 2,
  patchesField: null,
  pointsField: null,
  model: null,
  ready: true,
  timestamp: null,
};

const RESPONSE: ColorResponse = {
  values: { style: "categorical", indices: new Uint16Array([0, 1, 0]) },
  meta: { style: "categorical" },
};

describe("useColorColumn", () => {
  it("loads field choices for the run", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a", "b"]);
    const { result } = renderHook(() =>
      useColumnWithColors("ds", "viz", RUN, null),
    );

    await waitFor(() => expect(result.current.choices).toEqual(["a", "b"]));
    expect(result.current.colors).toBeNull();
    expect(fetchColor).not.toHaveBeenCalled();
  });

  it("falls back to no choices when the endpoint fails", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValueOnce(["a"]);
    const { result, rerender } = renderHook(
      ({ run }: { run: VisualizationRun }) =>
        useColumnWithColors("ds", "viz", run, null),
      { initialProps: { run: RUN } },
    );
    await waitFor(() => expect(result.current.choices).toEqual(["a"]));

    vi.mocked(fetchColorByChoices).mockRejectedValueOnce(new Error("nope"));
    rerender({ run: { ...RUN } });
    await waitFor(() => expect(result.current.choices).toEqual([]));
    expect(result.current.error).toBeNull();
  });

  it("builds the rgb column for the selected field", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["label"]);
    vi.mocked(fetchColor).mockResolvedValue(RESPONSE);
    const { result } = renderHook(() =>
      useColumnWithColors("ds", "viz", RUN, "label"),
    );

    await waitFor(() => expect(result.current.colors).not.toBeNull());
    // One rgb triplet per point, same class -> same color
    const colors = result.current.colors as Float32Array;
    expect(colors.length).toBe(9);
    expect([...colors.slice(0, 3)]).toEqual([...colors.slice(6, 9)]);
  });

  it("clears the column immediately when the field changes", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a", "b"]);
    vi.mocked(fetchColor).mockResolvedValueOnce(RESPONSE);
    const { result, rerender } = renderHook(
      ({ field }: { field: string | null }) =>
        useColumnWithColors("ds", "viz", RUN, field),
      { initialProps: { field: "a" as string | null } },
    );
    await waitFor(() => expect(result.current.colors).not.toBeNull());

    // The next fetch never resolves; a stale column must not linger
    vi.mocked(fetchColor).mockImplementationOnce(
      () => new Promise<ColorResponse>(() => undefined),
    );
    rerender({ field: "b" });
    expect(result.current.colors).toBeNull();

    // Deselecting also clears without fetching
    rerender({ field: null });
    expect(result.current.colors).toBeNull();
  });

  it("reports color fetch failures", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a"]);
    vi.mocked(fetchColor).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useColumnWithColors("ds", "viz", RUN, "a"),
    );

    await waitFor(() => expect(result.current.error).toMatch("boom"));
    // Failure also ends the loading state, or the spinner never leaves
    expect(result.current.loading).toBe(false);
  });

  // Column fetches take seconds at scale; hosts need a progress signal
  it("reports loading while a column fetch is in flight", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a"]);
    let resolve: (response: ColorResponse) => void = () => undefined;
    vi.mocked(fetchColor).mockImplementationOnce(
      () => new Promise<ColorResponse>((r) => (resolve = r)),
    );
    const { result, rerender } = renderHook(
      ({ field }: { field: string | null }) =>
        useColumnWithColors("ds", "viz", RUN, field),
      { initialProps: { field: "a" as string | null } },
    );

    expect(result.current.loading).toBe(true);
    resolve(RESPONSE);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.colors).not.toBeNull();

    // Deselecting the field never enters a loading state
    rerender({ field: null });
    expect(result.current.loading).toBe(false);
  });
});
