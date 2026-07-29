import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  clearPointPrompts: vi.fn(),
  seed: {
    markSeedNew: vi.fn(),
    shouldSeedNew: vi.fn(() => false),
    consumeSeedNew: vi.fn(() => false),
    clearSeedNew: vi.fn(),
  },
}));

vi.mock("./useClearPointPrompts", () => ({
  useClearPointPrompts: () => hoisted.clearPointPrompts,
}));

vi.mock("./usePointSelectionSeed", () => ({
  usePointSelectionSeed: () => hoisted.seed,
}));

import { useEndPointSession } from "./useEndPointSession";

describe("useEndPointSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Clearing alone leaves the committed detection selected — and auto-extend
  // put it on the next frame too — so the next click would refine (overwrite)
  // its mask instead of creating the new object being pointed at.
  it("clears the prompts AND seeds a new label for the next point", () => {
    const { result } = renderHook(() => useEndPointSession());

    result.current();

    expect(hoisted.clearPointPrompts).toHaveBeenCalledTimes(1);
    expect(hoisted.seed.markSeedNew).toHaveBeenCalledTimes(1);
  });
});
