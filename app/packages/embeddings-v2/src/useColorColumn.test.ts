// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ColorColumnSource } from "./extensions";
import {
  fetchColor,
  fetchColorByChoices,
  type ColorResponse,
  type VisualizationRun,
} from "./protocol";
import { useColorColumn } from "./useColorColumn";

vi.mock("./protocol", () => ({
  fetchColorByChoices: vi.fn(),
  fetchColor: vi.fn(),
}));

const RUN: VisualizationRun = {
  brainKey: "viz",
  method: null,
  dims: 2,
  patchesField: null,
  pointsField: null,
  model: null,
  ready: true,
  error: null,
  timestamp: null,
};

const RESPONSE: ColorResponse = {
  values: { style: "categorical", indices: new Uint16Array([0, 1, 0]) },
  meta: { style: "categorical" },
};

describe("useColorColumn", () => {
  it("loads field choices for the run", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a", "b"]);
    const { result } = renderHook(() => useColorColumn("ds", "viz", RUN, null));

    await waitFor(() => expect(result.current.choices).toEqual(["a", "b"]));
    expect(result.current.values).toBeNull();
    expect(fetchColor).not.toHaveBeenCalled();
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

  it("fetches the value column and meta for the selected field", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["label"]);
    vi.mocked(fetchColor).mockResolvedValue(RESPONSE);
    const { result } = renderHook(() =>
      useColorColumn("ds", "viz", RUN, "label"),
    );

    await waitFor(() => expect(result.current.values).not.toBeNull());
    expect(result.current.values).toEqual(RESPONSE.values);
    expect(result.current.meta).toEqual(RESPONSE.meta);
  });

  it("clears the column immediately when the field changes", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a", "b"]);
    vi.mocked(fetchColor).mockResolvedValueOnce(RESPONSE);
    const { result, rerender } = renderHook(
      ({ field }: { field: string | null }) =>
        useColorColumn("ds", "viz", RUN, field),
      { initialProps: { field: "a" as string | null } },
    );
    await waitFor(() => expect(result.current.values).not.toBeNull());

    // The next fetch never resolves; a stale column must not linger
    vi.mocked(fetchColor).mockImplementationOnce(
      () => new Promise<ColorResponse>(() => undefined),
    );
    rerender({ field: "b" });
    expect(result.current.values).toBeNull();

    // Deselecting also clears without fetching
    rerender({ field: null });
    expect(result.current.values).toBeNull();
  });

  it("reports color fetch failures", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["a"]);
    vi.mocked(fetchColor).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useColorColumn("ds", "viz", RUN, "a"));

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
        useColorColumn("ds", "viz", RUN, field),
      { initialProps: { field: "a" as string | null } },
    );

    expect(result.current.loading).toBe(true);
    resolve(RESPONSE);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.values).not.toBeNull();

    // Deselecting the field never enters a loading state
    rerender({ field: null });
    expect(result.current.loading).toBe(false);
  });

  it("aborts a superseded source resolve instead of letting it run on", () => {
    const signals: AbortSignal[] = [];
    const source: ColorColumnSource = {
      choices: ["a", "b"],
      resolve: vi.fn((_field, _onPartial, signal?: AbortSignal) => {
        if (signal) signals.push(signal);
        // Never settles: a cancellable source only stops via the signal
        return new Promise<ColorResponse>(() => undefined);
      }),
    };
    const { rerender, unmount } = renderHook(
      ({ field }: { field: string | null }) =>
        useColorColumn("ds", "viz", RUN, field, source),
      { initialProps: { field: "a" as string | null } },
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    // Superseding the field releases the old resolve's interest
    rerender({ field: "b" });
    expect(signals[0].aborted).toBe(true);
    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(false);

    // Unmounting releases the in-flight resolve too
    unmount();
    expect(signals[1].aborted).toBe(true);
  });

  // A field restored from panel state can resolve before the source's plan
  // has arrived; the rejection must not outlive the plan landing
  it("re-resolves and clears the error when the source's revision changes", async () => {
    const resolve = vi
      .fn()
      .mockRejectedValueOnce(new Error("column unavailable"))
      .mockResolvedValueOnce(RESPONSE);
    const source = (revision: string) => ({
      choices: ["a"],
      resolve,
      revision,
    });
    const { result, rerender } = renderHook(
      ({ revision }: { revision: string }) =>
        useColorColumn("ds", "viz", RUN, "a", source(revision)),
      { initialProps: { revision: "no-plan" } },
    );
    await waitFor(() =>
      expect(result.current.error).toMatch("column unavailable"),
    );

    rerender({ revision: "plan:v1" });
    await waitFor(() => expect(result.current.values).not.toBeNull());
    expect(result.current.error).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
