import { describe, expect, it, vi } from "vitest";
import {
  invalidateDatasetTemporalTags,
  onTemporalTagsMutated,
} from "./dataset-tags";

describe("onTemporalTagsMutated", () => {
  it("hears a mutation on a dataset whose tags no grid has loaded", () => {
    const listener = vi.fn();
    const unsubscribe = onTemporalTagsMutated(listener);

    invalidateDatasetTemporalTags("never-loaded");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    invalidateDatasetTemporalTags("never-loaded");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
