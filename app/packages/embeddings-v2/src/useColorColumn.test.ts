// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  fetchColorByChoices,
  fetchColorMeta,
  fetchColorValues,
  type ColorMeta,
  type ColorValues,
  type VisualizationRun,
} from "./protocol";
import { useColorColumn } from "./useColorColumn";

vi.mock("./protocol", () => ({
  fetchColorByChoices: vi.fn(),
  fetchColorMeta: vi.fn(),
  fetchColorValues: vi.fn(),
}));

const RUN: VisualizationRun = {
  brainKey: "viz",
  method: null,
  dims: 2,
  patchesField: null,
  pointsField: null,
  model: null,
  timestamp: null,
};

const CATEGORICAL: ColorValues = {
  style: "categorical",
  indices: new Uint16Array([0, 1, 0]),
};
const META: ColorMeta = { style: "categorical" };

describe("useColorColumn", () => {
  it("loads field choices for the run", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a", "b"]);
    const { result } = renderHook(() => useColorColumn("ds", "viz", RUN, null));

    await waitFor(() => expect(result.current.choices).toEqual(["a", "b"]));
    expect(result.current.colors).toBeNull();
    expect(fetchColorValues).not.toHaveBeenCalled();
  });

  it("falls back to no choices when the endpoint fails", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValueOnce(["a"]);
    const { result, rerender } = renderHook(
      ({ run }: { run: VisualizationRun }) =>
        useColorColumn("ds", "viz", run, null),
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
    vi.mocked(fetchColorValues).mockResolvedValue(CATEGORICAL);
    vi.mocked(fetchColorMeta).mockResolvedValue(META);
    const { result } = renderHook(() =>
      useColorColumn("ds", "viz", RUN, "label"),
    );

    await waitFor(() => expect(result.current.colors).not.toBeNull());
    // One rgb triplet per point, same class -> same color
    const colors = result.current.colors as Float32Array;
    expect(colors.length).toBe(9);
    expect([...colors.slice(0, 3)]).toEqual([...colors.slice(6, 9)]);
  });

  it("clears the column immediately when the field changes", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a", "b"]);
    vi.mocked(fetchColorMeta).mockResolvedValue(META);
    vi.mocked(fetchColorValues).mockResolvedValueOnce(CATEGORICAL);
    const { result, rerender } = renderHook(
      ({ field }: { field: string | null }) =>
        useColorColumn("ds", "viz", RUN, field),
      { initialProps: { field: "a" as string | null } },
    );
    await waitFor(() => expect(result.current.colors).not.toBeNull());

    // The next fetch never resolves; a stale column must not linger
    vi.mocked(fetchColorValues).mockImplementationOnce(
      () => new Promise<ColorValues>(() => undefined),
    );
    rerender({ field: "b" });
    expect(result.current.colors).toBeNull();

    // Deselecting also clears without fetching
    rerender({ field: null });
    expect(result.current.colors).toBeNull();
  });

  it("reports color fetch failures", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a"]);
    vi.mocked(fetchColorValues).mockRejectedValue(new Error("boom"));
    vi.mocked(fetchColorMeta).mockResolvedValue(META);
    const { result } = renderHook(() => useColorColumn("ds", "viz", RUN, "a"));

    await waitFor(() => expect(result.current.error).toMatch("boom"));
  });
});
