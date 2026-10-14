import { act, cleanup, renderHook } from "@testing-library/react";
// Exercise the existing Recoil stores; production callers use the domain hook.
// eslint-disable-next-line no-restricted-imports
import { RecoilRoot, useRecoilValue } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

// Sorting needs the server-fed dataset ID; the query constraints use their
// real stores and mirrors so a reset cannot pass by replacing the inputs.
vi.mock("../recoil/selectors", async () => {
  const { atom } = await import("recoil");
  return {
    datasetId: atom({ key: "gridScopeTestDataset", default: "dataset" }),
  };
});
import {
  extendedSelection,
  extendedSelectionOverrideStage,
  similarityParameters,
} from "../recoil/atoms";
import { filters } from "../recoil/filters";
import {
  gridSortBy,
  gridSortByStore,
  gridSortDescendingStore,
} from "../recoil/grid";
import { useClearGridViewConstraints } from "./dataset";

afterEach(cleanup);

describe("opening a fresh grid scope", () => {
  it("clears sidebar, search, and sorting constraints", () => {
    const { result } = renderHook(
      () => ({
        clear: useClearGridViewConstraints(),
        filters: useRecoilValue(filters),
        selection: useRecoilValue(extendedSelection),
        override: useRecoilValue(extendedSelectionOverrideStage),
        similarity: useRecoilValue(similarityParameters),
        sortField: useRecoilValue(gridSortByStore("dataset")),
        sortDescending: useRecoilValue(gridSortDescendingStore("dataset")),
      }),
      {
        wrapper: ({ children }) => (
          <RecoilRoot
            initializeState={({ set }) => {
              set(filters, {
                tags: { values: ["rainy"], exclude: false },
                _temporal_tags: { values: ["turning"], exclude: false },
              });
              set(extendedSelection, { selection: ["sample"] });
              set(extendedSelectionOverrideStage, {
                "fiftyone.core.stages.Select": { sample_ids: ["sample"] },
              });
              set(similarityParameters, {
                brainKey: "similarity",
                query: "sample",
                k: 10,
              });
              set(gridSortBy, { field: "confidence", descending: true });
            }}
          >
            {children}
          </RecoilRoot>
        ),
      },
    );
    expect(result.current.filters.tags.values).toEqual(["rainy"]);
    expect(result.current.selection.selection).toEqual(["sample"]);
    expect(result.current.override).not.toBeNull();
    expect(result.current.similarity).not.toBeNull();
    expect(result.current.sortField).toBe("confidence");
    expect(result.current.sortDescending).toBe(true);

    act(() => result.current.clear());

    expect(result.current.filters).toEqual({});
    expect(result.current.selection.selection).toBeNull();
    expect(result.current.override).toBeNull();
    expect(result.current.similarity).toBeNull();
    expect(result.current.sortField).toBeNull();
    expect(result.current.sortDescending).toBe(false);
  });
});
