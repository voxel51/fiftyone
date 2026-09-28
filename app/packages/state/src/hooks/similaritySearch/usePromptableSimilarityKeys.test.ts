import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const values = vi.hoisted(() => ({
  similarityMethods: { samples: [], patches: [] },
  dataset: {
    brainMethods: [
      {
        key: "emb_sim",
        timestamp: "2026-09-01T00:00:00",
        config: {
          method: "multimodal",
          supportsPrompts: true,
          model: "siglip",
        },
      },
    ],
  },
}));

vi.mock("@fiftyone/state", () => ({
  similarityMethods: { key: "similarityMethods" },
  dataset: { key: "dataset" },
}));
vi.mock("recoil", () => ({
  useRecoilValue: ({ key }: { key: keyof typeof values }) => values[key],
}));

import { registerTextSearchProvider } from "./textSearchProviders";
import usePromptableSimilarityKeys from "./usePromptableSimilarityKeys";

describe("usePromptableSimilarityKeys", () => {
  it("offers an index the server cannot sort by once a provider for its method registers", () => {
    const { result } = renderHook(() => usePromptableSimilarityKeys());
    expect(result.current).toStrictEqual([]);

    let unregister = () => undefined as void;
    act(() => {
      unregister = registerTextSearchProvider({
        method: "multimodal",
        search: vi.fn(),
      });
    });

    expect(result.current).toStrictEqual([
      {
        key: "emb_sim",
        patchesField: null,
        model: "siglip",
        provider: "multimodal",
        timestamp: "2026-09-01T00:00:00",
      },
    ]);
    act(() => unregister());
  });
});
