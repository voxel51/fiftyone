import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const EMB_SIM = {
  key: "emb_sim",
  timestamp: "2026-09-01T00:00:00",
  config: {
    type: "similarity",
    cls: "fiftyone.multimodal.MultimodalSimilarityConfig",
    method: "multimodal",
    supportsPrompts: true,
    patchesField: null,
    model: "siglip",
  },
};
const CLIP_SIM = {
  key: "clip_sim",
  timestamp: "2026-09-02T00:00:00",
  config: {
    type: "similarity",
    cls: "fiftyone.brain.SimilarityConfig",
    method: "sklearn",
    supportsPrompts: true,
    patchesField: null,
    model: "clip",
  },
};

const values = vi.hoisted(() => ({
  similarityMethods: { samples: [] as unknown[], patches: [] as unknown[] },
  dataset: { brainMethods: [] as unknown[] },
}));

vi.mock("@fiftyone/state", () => ({
  similarityMethods: { key: "similarityMethods" },
  dataset: { key: "dataset" },
}));
vi.mock("recoil", () => ({
  useRecoilValue: ({ key }: { key: keyof typeof values }) => values[key],
}));

import { registerTextSearchExtension } from "./textSearchExtensions";
import usePromptableSimilarityKeys from "./usePromptableSimilarityKeys";

describe("usePromptableSimilarityKeys", () => {
  beforeEach(() => {
    values.similarityMethods = { samples: [], patches: [] };
    values.dataset = { brainMethods: [EMB_SIM] };
  });

  it("offers an index the server cannot sort by once an extension for its method registers", () => {
    const { result } = renderHook(() => usePromptableSimilarityKeys());
    expect(result.current).toStrictEqual([]);

    let unregister = () => undefined as void;
    act(() => {
      unregister = registerTextSearchExtension({
        method: "multimodal",
        search: vi.fn(),
      });
    });

    expect(result.current).toStrictEqual([
      {
        key: "emb_sim",
        patchesField: null,
        model: "siglip",
        extension: "multimodal",
        timestamp: "2026-09-01T00:00:00",
      },
    ]);
    act(() => unregister());
  });

  it("offers an index the server can sort once, as the extension's, when an extension claims its method", () => {
    values.similarityMethods = {
      samples: [{ key: "clip_sim", supportsPrompts: true }],
      patches: [],
    };
    values.dataset = { brainMethods: [CLIP_SIM] };
    const unregister = registerTextSearchExtension({
      method: "sklearn",
      search: vi.fn(),
    });

    try {
      const { result } = renderHook(() => usePromptableSimilarityKeys());
      expect(result.current).toStrictEqual([
        {
          key: "clip_sim",
          patchesField: null,
          model: "clip",
          extension: "sklearn",
          timestamp: "2026-09-02T00:00:00",
        },
      ]);
    } finally {
      unregister();
    }
  });
});
