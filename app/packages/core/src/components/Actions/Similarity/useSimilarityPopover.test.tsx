import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useSimilaritySearchIndexPreference,
  useSimilaritySearchResultCount,
} from "@fiftyone/state/src/similarity-search/hooks";
import useSimilarityPopover from "./useSimilarityPopover";
import SimilaritySettings from "../../Grid/Selection/SimilaritySettings";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  set: vi.fn(),
  datasetId: "dataset-id",
  datasetName: "animals",
  keys: ["clip", "resnet"],
}));

vi.mock("@fiftyone/operators", () => ({ executeOperator: mocks.execute }));
vi.mock("@fiftyone/operators/src/types", () => ({
  ViewTarget: { CURRENT_VIEW: "CURRENT_VIEW" },
}));
vi.mock("@fiftyone/state", async () => ({
  ...(await import("@fiftyone/state/src/similarity-search/hooks")),
  useAssertedRecoilValue: () => mocks.datasetId,
  useCurrentDatasetName: () => mocks.datasetName,
  dataset: "dataset",
  datasetId: "datasetId",
  hasSelectedLabels: "hasSelectedLabels",
  selectedLabels: "selectedLabels",
  similarityMethods: "similarityMethods",
  modalSelector: "modalSelector",
  extendedSelection: "extendedSelection",
}));
vi.mock("./utils", () => ({
  availableSimilarityKeys: () => "keys",
  sortType: () => "type",
  buildRunName: () => "similar samples",
}));
vi.mock("recoil", () => {
  const read = (key: string) => {
    switch (key) {
      case "keys":
        return mocks.keys;
      case "dataset":
        return {
          brainMethods: [{ key: "clip", config: { model: "clip-model" } }],
        };
      case "selectedLabels":
        return [];
      case "similarityMethods":
        return { patches: [] };
      case "type":
        return "images";
      default:
        return false;
    }
  };
  return {
    useRecoilValue: read,
    useRecoilCallback: (
      callback: (interface_: {
        snapshot: { getPromise: (key: string) => Promise<unknown> };
        set: typeof mocks.set;
      }) => unknown,
    ) =>
      callback({
        snapshot: { getPromise: async (key) => read(key) },
        set: mocks.set,
      }),
  };
});

function renderSearch() {
  const store = createStore();
  return renderHook(
    () => ({
      search: useSimilarityPopover({
        modal: false,
        isImageSearch: true,
        close: vi.fn(),
        query: { queryIds: ["sample-in-active-bucket"] },
      }),
      // Another mounted surface must observe the same preferences immediately.
      index: useSimilaritySearchIndexPreference(mocks.datasetId),
      results: useSimilaritySearchResultCount(mocks.datasetName),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    },
  );
}

describe("selection similarity settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.datasetId = "dataset-id";
    mocks.datasetName = "animals";
    mocks.keys = ["clip", "resnet"];
  });
  afterEach(cleanup);

  it("uses the existing stored index and result count in the bucket search", async () => {
    localStorage.setItem(
      "lastUsedBrainKeys",
      JSON.stringify({ "dataset-id": "resnet" }),
    );
    localStorage.setItem(
      "fiftyone-quick-search-matches",
      JSON.stringify({ animals: 50 }),
    );
    const { result } = renderSearch();

    await act(() => result.current.search.handleSearch());

    expect(mocks.execute).toHaveBeenCalledWith(
      "@voxel51/panels/similarity_search",
      expect.objectContaining({
        brain_key: "resnet",
        k: 50,
        query: ["sample-in-active-bucket"],
      }),
      expect.any(Object),
    );
  });

  it("applies settings chosen in the overflow panel to the request and other surfaces", async () => {
    function SearchControls() {
      const search = useSimilarityPopover({
        modal: false,
        isImageSearch: true,
        close: vi.fn(),
        query: { queryIds: ["sample-in-active-bucket"] },
      });
      const [count] = useSimilaritySearchResultCount(mocks.datasetName);
      const [index] = useSimilaritySearchIndexPreference(mocks.datasetId);
      return (
        <>
          <SimilaritySettings
            indexes={search.indexes}
            selectedKey={search.resolvedBrainKey}
            onSelectKey={search.setBrainKey}
            k={search.k}
            onChangeK={search.setK}
            onOpenPanel={search.handleOpenPanel}
          />
          <output>{`${index}: ${count}`}</output>
          <button onClick={search.handleSearch}>Find similar</button>
        </>
      );
    }
    render(
      <Provider store={createStore()}>
        <SearchControls />
      </Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Similarity index" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "resnet" }));
    fireEvent.click(screen.getByRole("button", { name: "Number of results" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Top 100" }));
    expect(screen.getByText("resnet: 100")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("lastUsedBrainKeys")!)).toEqual({
      "dataset-id": "resnet",
    });
    expect(
      JSON.parse(localStorage.getItem("fiftyone-quick-search-matches")!),
    ).toEqual({ animals: 100 });

    fireEvent.click(
      screen.getByRole("button", { name: "Find similar", exact: true }),
    );
    await waitFor(() =>
      expect(mocks.execute).toHaveBeenCalledWith(
        "@voxel51/panels/similarity_search",
        expect.objectContaining({ brain_key: "resnet", k: 100 }),
        expect.any(Object),
      ),
    );
  });

  it("keeps preferences scoped to the dataset and preserves other datasets", () => {
    localStorage.setItem(
      "lastUsedBrainKeys",
      JSON.stringify({ other: "other-index" }),
    );
    localStorage.setItem(
      "fiftyone-quick-search-matches",
      JSON.stringify({ other: 250 }),
    );
    const { result, rerender } = renderSearch();
    act(() => {
      result.current.search.setBrainKey("resnet");
      result.current.search.setK(50);
    });
    mocks.datasetId = "other";
    mocks.datasetName = "other";
    rerender();
    expect(result.current.results[0]).toBe(250);
    expect(result.current.index[0]).toBe("other-index");
  });

  it("falls back when a stored index is unavailable or a count is invalid", () => {
    localStorage.setItem(
      "lastUsedBrainKeys",
      JSON.stringify({ "dataset-id": "deleted-index" }),
    );
    localStorage.setItem(
      "fiftyone-quick-search-matches",
      JSON.stringify({ animals: -5 }),
    );
    const { result } = renderSearch();
    expect(result.current.search.resolvedBrainKey).toBe("clip");
    expect(result.current.search.k).toBe(25);
    expect(result.current.search.indexes[0].label).toBe("clip · clip-model");
  });
});
