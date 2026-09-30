import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  view: [] as { _cls: string; kwargs: [string, unknown][] }[],
  filters: {} as Record<string, unknown>,
  extended: {} as Record<string, unknown>,
  search: vi.fn(),
  sources: vi.fn(),
  publish: vi.fn(),
  setPending: vi.fn(),
  notify: vi.fn(),
  onRun: vi.fn(),
  providers: new Map(),
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetId: () => "dataset-id",
  useCurrentDatasetName: () => "robots",
  useView: () => env.view,
  useFilters: () => env.filters,
  useExtendedStages: () => env.extended,
  useTextSearchProviders: () => env.providers,
  usePublishExtendedSelection: () => env.publish,
  useSetViewChangePending: () => env.setPending,
  useNotification: () => env.notify,
}));

import { HistorySuggestions } from "./HistorySuggestions";
import { useProviderSearch } from "./useProviderSearch";

const INDEX = {
  key: "emb_sim",
  patchesField: null,
  provider: "multimodal",
  timestamp: null,
};
const SEARCH_INDEX = {
  datasetName: "robots",
  brainKey: "emb_sim",
  runTimestamp: null,
};

const providerSearch = (sourcesWanted = false) =>
  useProviderSearch({
    onRun: env.onRun,
    selectedIndex: INDEX,
    searchIndex: SEARCH_INDEX,
    sourcesWanted,
  });

const renderSearch = () => renderHook(() => providerSearch());
const STAGE = { "fiftyone.core.stages.Select": { sample_ids: ["ep1"] } };

/** A search the test settles by hand. */
const pendingResult = () => {
  let resolve: (value: unknown) => void = () => undefined;
  env.search.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  return resolve;
};

describe("useProviderSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.view = [];
    env.filters = {};
    env.extended = {};
    env.providers = new Map([
      ["multimodal", { method: "multimodal", search: env.search }],
    ]);
  });

  it("publishes the provider's result to the extended selection", async () => {
    const decorate = vi.fn();
    const resolve = pendingResult();
    const { result } = renderSearch();

    act(() => {
      result.current.run(INDEX, "an animal", 25, null);
    });
    expect(env.setPending).toHaveBeenLastCalledWith(true);
    await act(async () => resolve({ stage: STAGE, decorate }));

    expect(env.search).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "dataset-id",
        datasetName: "robots",
        brainKey: "emb_sim",
        query: "an animal",
        k: 25,
      }),
    );
    expect(env.publish).toHaveBeenCalledWith(STAGE, decorate);
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });

  it("sends the view context an operator is sent", () => {
    pendingResult();
    env.view = [{ _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 5]] }];
    env.filters = { "ground_truth.label": { values: ["cat"] } };
    env.extended = {
      "fiftyone.core.stages.Select": { sample_ids: ["ep1"], ordered: false },
    };
    const { result } = renderSearch();

    act(() => {
      result.current.run(INDEX, "an animal", 25, null);
    });

    expect(env.search).toHaveBeenCalledWith(
      expect.objectContaining({
        view: env.view,
        filters: env.filters,
        extended: env.extended,
      }),
    );
  });

  it("asks the provider to rank within the chosen sources", () => {
    pendingResult();
    const { result } = renderSearch();

    act(() => {
      result.current.run(INDEX, "an animal", 25, ["/cam_left"]);
    });

    expect(env.search).toHaveBeenCalledWith(
      expect.objectContaining({ sources: ["/cam_left"] }),
    );
  });

  it("reports each search it runs", () => {
    pendingResult();
    const { result } = renderSearch();

    act(() => {
      result.current.run(INDEX, "an animal", 25, null);
    });

    expect(env.onRun).toHaveBeenCalledWith(INDEX, "an animal");
  });

  it("does nothing for an index no registered provider searches", () => {
    const { result } = renderSearch();

    act(() => {
      result.current.run({ ...INDEX, provider: null }, "a car", 25, null);
    });

    expect(env.search).not.toHaveBeenCalled();
    expect(env.setPending).not.toHaveBeenCalled();
    expect(env.onRun).not.toHaveBeenCalled();
  });

  it("publishes only the newest search when an older one settles later", async () => {
    const first = pendingResult();
    const second = pendingResult();
    const { result } = renderSearch();

    act(() => {
      result.current.run(INDEX, "an animal", 25, null);
      result.current.run(INDEX, "a car", 25, null);
    });
    const newer = { "fiftyone.core.stages.Select": { sample_ids: ["ep2"] } };
    await act(async () => second({ stage: newer }));
    await act(async () => first({ stage: STAGE }));

    expect(env.publish).toHaveBeenCalledTimes(1);
    expect(env.publish).toHaveBeenCalledWith(newer, undefined);
  });

  it("publishes and reports nothing for a search a newer one elsewhere replaced", async () => {
    const resolve = pendingResult();
    const { result } = renderSearch();

    act(() => {
      result.current.run(INDEX, "an animal", 25, null);
    });
    await act(async () => resolve(null));

    expect(env.publish).not.toHaveBeenCalled();
    expect(env.notify).not.toHaveBeenCalled();
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });

  it("fails a provider that throws before returning its promise like any other failure", async () => {
    env.search.mockImplementationOnce(() => {
      throw new Error("the provider is misconfigured");
    });
    const { result } = renderSearch();

    await act(async () => {
      result.current.run(INDEX, "an animal", 25, null);
    });

    expect(env.notify).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "the provider is misconfigured" }),
    );
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });

  it("tells an older search to stop when a newer one starts", () => {
    pendingResult();
    pendingResult();
    const { result } = renderSearch();

    act(() => {
      result.current.run(INDEX, "an animal", 25, null);
    });
    act(() => {
      result.current.run(INDEX, "a car", 25, null);
    });

    expect(env.search.mock.calls[0][0].signal.aborted).toBe(true);
    expect(env.search.mock.calls[1][0].signal.aborted).toBe(false);
  });

  it("drops a search still running when the field unmounts", async () => {
    const resolve = pendingResult();
    const { result, unmount } = renderSearch();

    act(() => {
      result.current.run(INDEX, "an animal", 25, null);
    });
    unmount();
    expect(env.search.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => resolve({ stage: STAGE }));

    expect(env.publish).not.toHaveBeenCalled();
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });

  it("drops a search when the view changes before it settles", async () => {
    const resolve = pendingResult();
    const { result, rerender } = renderSearch();

    act(() => {
      result.current.run(INDEX, "an animal", 25, null);
    });
    env.view = [{ _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 5]] }];
    rerender();
    expect(env.search.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => resolve({ stage: STAGE }));

    expect(env.publish).not.toHaveBeenCalled();
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });

  it("asks the provider for the selected index's sources only once wanted", async () => {
    const streams = { label: "Streams", values: ["/cam_left", "/cam_right"] };
    env.sources.mockResolvedValue(streams);
    env.providers = new Map([
      [
        "multimodal",
        { method: "multimodal", search: env.search, sources: env.sources },
      ],
    ]);
    const { result, rerender } = renderHook(
      ({ wanted }) => providerSearch(wanted),
      { initialProps: { wanted: false } },
    );
    expect(env.sources).not.toHaveBeenCalled();

    rerender({ wanted: true });
    await waitFor(() => expect(result.current.sources).toStrictEqual(streams));
    expect(env.sources).toHaveBeenCalledWith(SEARCH_INDEX);
  });

  it("offers the provider's suggestions, or the previous queries when it has none", () => {
    const Suggestions = () => null;
    env.providers = new Map([
      ["multimodal", { method: "multimodal", search: env.search, Suggestions }],
    ]);
    expect(renderSearch().result.current.Suggestions).toBe(Suggestions);

    env.providers = new Map([
      ["multimodal", { method: "multimodal", search: env.search }],
    ]);
    expect(renderSearch().result.current.Suggestions).toBe(HistorySuggestions);
  });
});
