import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  const sources = vi.fn();
  // One snapshot, as the registry hands out until a provider registers
  const providers = new Map([
    ["multimodal", { method: "multimodal", search: vi.fn(), sources }],
  ]);
  return { sources, providers, fetch: vi.fn(), grouped: false };
});

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "robots",
  useIsGroupDataset: () => env.grouped,
  useTextSearchProviders: () => env.providers,
}));
vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: () => env.fetch,
}));

import { clearIndexSlices } from "./useIndexSlices";
import { useSearchSources } from "./useSearchSources";

const INDEX = {
  key: "emb_sim",
  patchesField: null,
  provider: "multimodal",
  timestamp: null,
};

const SERVER_INDEX = { key: "clip_sim", patchesField: null, timestamp: null };

describe("useSearchSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIndexSlices();
    env.grouped = false;
  });

  it("asks the provider only once wanted", async () => {
    const streams = { label: "Streams", values: ["/cam_left", "/cam_right"] };
    env.sources.mockResolvedValue(streams);
    const { result, rerender } = renderHook(
      ({ wanted }) => useSearchSources(INDEX, wanted),
      { initialProps: { wanted: false } },
    );
    expect(env.sources).not.toHaveBeenCalled();

    rerender({ wanted: true });
    await waitFor(() => expect(result.current).toStrictEqual(streams));
  });

  it("offers nothing to choose for an index with one source", async () => {
    env.sources.mockResolvedValue({ label: "Streams", values: ["/cam"] });
    const { result } = renderHook(() => useSearchSources(INDEX, true));
    // Settles the provider's answer
    await act(async () => undefined);
    expect(env.sources).toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("offers the slices a server-searched index covers on a grouped dataset, once wanted", async () => {
    env.grouped = true;
    env.fetch.mockResolvedValue({ slices: ["left", "right"] });
    const { result, rerender } = renderHook(
      ({ wanted }) => useSearchSources(SERVER_INDEX, wanted),
      { initialProps: { wanted: false } },
    );
    expect(env.fetch).not.toHaveBeenCalled();

    rerender({ wanted: true });
    await waitFor(() =>
      expect(result.current).toStrictEqual({
        label: "Slices",
        values: ["left", "right"],
      }),
    );
    expect(env.fetch).toHaveBeenCalledWith("POST", "/similarity-index-slices", {
      dataset: "robots",
      brainKey: "clip_sim",
    });
  });

  it("asks for no slices outside a grouped dataset, or for a provider's or a patches index", async () => {
    env.fetch.mockResolvedValue({ slices: ["left", "right"] });
    renderHook(() => useSearchSources(SERVER_INDEX, true));
    env.grouped = true;
    renderHook(() => useSearchSources(INDEX, true));
    renderHook(() =>
      useSearchSources({ ...SERVER_INDEX, patchesField: "detections" }, true),
    );
    await act(async () => undefined);

    expect(env.fetch).not.toHaveBeenCalled();
  });

  it("offers nothing to choose for an index over one slice", async () => {
    env.grouped = true;
    env.fetch.mockResolvedValue({ slices: ["left"] });
    const { result } = renderHook(() => useSearchSources(SERVER_INDEX, true));
    await act(async () => undefined);

    expect(env.fetch).toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
