import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  invalidateDatasetTemporalTags,
  onTemporalTagsMutated,
  useDatasetTemporalTags,
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

describe("useDatasetTemporalTags", () => {
  it("asks the server once however many tiles ask, and again after an invalidation", async () => {
    const listDatasetTemporalTags = vi.fn(async () => []);
    const client = { listDatasetTemporalTags } as unknown as Parameters<
      typeof useDatasetTemporalTags
    >[1];
    const showTile = () =>
      renderHook(() => useDatasetTemporalTags("load-once", client));

    showTile();
    await waitFor(() => expect(listDatasetTemporalTags).toHaveBeenCalled());
    await act(async () => undefined);
    showTile();
    showTile();
    expect(listDatasetTemporalTags).toHaveBeenCalledTimes(1);

    invalidateDatasetTemporalTags("load-once", client);
    expect(listDatasetTemporalTags).toHaveBeenCalledTimes(2);
  });
});
