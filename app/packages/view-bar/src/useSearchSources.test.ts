import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  const sources = vi.fn();
  // One snapshot, as the registry hands out until a provider registers
  const providers = new Map([
    ["multimodal", { method: "multimodal", search: vi.fn(), sources }],
  ]);
  return { sources, providers };
});

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "robots",
  useTextSearchProviders: () => env.providers,
}));

import { useSearchSources } from "./useSearchSources";

const INDEX = {
  key: "emb_sim",
  patchesField: null,
  provider: "multimodal",
  timestamp: null,
};

describe("useSearchSources", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
