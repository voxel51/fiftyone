import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ fetch: vi.fn(), grouped: true }));

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "robots",
  useIsGroupDataset: () => env.grouped,
}));
vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: () => env.fetch,
}));

import { clearIndexSlices, useIndexSlices } from "./useIndexSlices";

const INDEXES = [
  { key: "clip_sim", patchesField: null, timestamp: "t1" },
  { key: "siglip_sim", patchesField: null, timestamp: "t2" },
];

describe("useIndexSlices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    clearIndexSlices();
    env.grouped = true;
  });

  it("asks the server once per index for the session", async () => {
    env.fetch.mockImplementation(async (_, __, { brainKey }) => ({
      slices: brainKey === "clip_sim" ? ["left", "right"] : ["pcd"],
    }));

    const first = renderHook(() => useIndexSlices(INDEXES, true));
    await waitFor(() => expect(first.result.current.size).toBe(2));
    const second = renderHook(() => useIndexSlices(INDEXES, true));
    await waitFor(() => expect(second.result.current.size).toBe(2));

    expect(second.result.current.get("clip_sim")).toStrictEqual([
      "left",
      "right",
    ]);
    expect(second.result.current.get("siglip_sim")).toStrictEqual(["pcd"]);
    expect(env.fetch).toHaveBeenCalledTimes(2);
    expect(env.fetch).toHaveBeenCalledWith("POST", "/similarity-index-slices", {
      dataset: "robots",
      brainKey: "clip_sim",
    });
  });

  it("asks nothing until wanted", async () => {
    renderHook(() => useIndexSlices(INDEXES, false));
    await act(async () => undefined);
    expect(env.fetch).not.toHaveBeenCalled();
  });

  it("asks for no slices outside a grouped dataset, or for a provider's or a patches index", async () => {
    env.fetch.mockResolvedValue({ slices: ["left", "right"] });
    env.grouped = false;
    renderHook(() => useIndexSlices(INDEXES, true));
    env.grouped = true;
    renderHook(() =>
      useIndexSlices(
        [
          { ...INDEXES[0], provider: "multimodal" },
          { ...INDEXES[1], patchesField: "detections" },
        ],
        true,
      ),
    );
    await act(async () => undefined);

    expect(env.fetch).not.toHaveBeenCalled();
  });

  it("asks again after a failed answer", async () => {
    env.fetch.mockRejectedValueOnce(new Error("offline"));
    env.fetch.mockResolvedValue({ slices: ["left", "right"] });
    const index = [INDEXES[0]];

    const failed = renderHook(() => useIndexSlices(index, true));
    await waitFor(() => expect(env.fetch).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(failed.result.current.size).toBe(0);

    const retried = renderHook(() => useIndexSlices(index, true));
    await waitFor(() => expect(retried.result.current.size).toBe(1));
    expect(env.fetch).toHaveBeenCalledTimes(2);
  });
});
