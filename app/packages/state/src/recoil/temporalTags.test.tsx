import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { RecoilRoot, useRecoilValue, useSetRecoilState } from "recoil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("@fiftyone/utilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/utilities")>();
  return { ...actual, getFetchFunctionExtended: () => fetchMock };
});

// Keep the module light: stub the filters atom and the sidebar constant so we
// don't pull the full sidebar/graphQL machinery into the test.
vi.mock("./sidebar", () => ({ TEMPORAL_TAGS_FIELD: "_temporal_tags" }));
vi.mock("./filters", async () => {
  const { atom, useRecoilValue } =
    await vi.importActual<typeof import("recoil")>("recoil");
  const testFilters = atom<Record<string, unknown>>({
    key: "test_filters",
    default: {},
  });
  // `useActiveTemporalTagFilterValues` delegates here, so the mock has to
  // carry the generic hook too. It reads the test atom but runs the real rule,
  // so nothing below is asserting a re-implementation of it — the rule's own
  // cases live in `filters.test.ts`.
  const { activeFilterValues } = await vi.importActual<
    typeof import("./activeFilterValues")
  >("./activeFilterValues");
  const useActiveFilterValues = (path: string): string[] =>
    activeFilterValues(useRecoilValue(testFilters), path);
  return { filters: testFilters, useActiveFilterValues };
});
vi.mock("./selectors", async () => {
  const { atom } = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    datasetId: atom<string | null>({
      key: "test_datasetId",
      default: "ds1",
    }),
  };
});
import { invalidateDatasetTemporalTags } from "../temporal-tags";
import { filters as filtersAtom } from "./filters";
import { datasetId as datasetIdAtom } from "./selectors";
import {
  fetchTemporalTagResults,
  temporalTagResults,
  useActiveTemporalTagFilterValues,
  useSyncTemporalTagResults,
} from "./temporalTags";

describe("fetchTemporalTagResults", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("shapes counts into results and a total", async () => {
    fetchMock.mockResolvedValue({
      response: { counts: { review: 2, keep: 1 } },
    });

    const { results, count } = await fetchTemporalTagResults("ds1");

    expect(results).toEqual([
      { value: "review", count: 2 },
      { value: "keep", count: 1 },
    ]);
    expect(count).toBe(3);
  });

  it("counts intervals, not the samples carrying them", async () => {
    fetchMock.mockResolvedValue({ response: { counts: {} } });

    await fetchTemporalTagResults("my dataset/1");

    // No `by_sample`: every other sidebar tag count reports occurrences.
    expect(fetchMock).toHaveBeenCalledWith({
      method: "GET",
      path: "/dataset/my%20dataset%2F1/tags/counts",
    });
  });

  it("returns an empty result set when there are no counts", async () => {
    fetchMock.mockResolvedValue({ response: {} });

    const { results, count } = await fetchTemporalTagResults("ds1");

    expect(results).toEqual([]);
    expect(count).toBe(0);
  });
});

describe("useActiveTemporalTagFilterValues", () => {
  const read = (initial: Record<string, unknown>) => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(filtersAtom, initial)}>
        {children}
      </RecoilRoot>
    );
    return renderHook(() => useActiveTemporalTagFilterValues(), { wrapper })
      .result.current;
  };

  it("returns the selected values for an inclusive filter", () => {
    expect(
      read({ _temporal_tags: { values: ["a", "b"], exclude: false } }),
    ).toEqual(["a", "b"]);
  });

  it("returns empty for an exclude filter", () => {
    expect(read({ _temporal_tags: { values: ["a"], exclude: true } })).toEqual(
      [],
    );
  });

  it("returns empty when the filter is unset", () => {
    expect(read({})).toEqual([]);
  });

  it("drops null values", () => {
    expect(
      read({ _temporal_tags: { values: ["a", null], exclude: false } }),
    ).toEqual(["a"]);
  });
});

describe("useSyncTemporalTagResults", () => {
  afterEach(() => {
    fetchMock.mockReset();
    cleanup();
  });

  function Harness() {
    useSyncTemporalTagResults();
    const results = useRecoilValue(temporalTagResults);
    return <div data-testid="probe">{JSON.stringify(results)}</div>;
  }

  const renderSync = () =>
    render(
      <RecoilRoot>
        <Harness />
      </RecoilRoot>,
    );

  it("fetches counts for the active dataset and populates the results", async () => {
    fetchMock.mockResolvedValue({ response: { counts: { review: 2 } } });

    renderSync();

    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toContain("review"),
    );
  });

  it("leaves results empty when the fetch fails", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));

    renderSync();

    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toContain('"results":[]'),
    );
  });

  it("clears results when the dataset becomes null", async () => {
    fetchMock.mockResolvedValue({ response: { counts: { review: 2 } } });

    let setDatasetId: ((value: string | null) => void) | undefined;
    function DatasetControl() {
      setDatasetId = useSetRecoilState(datasetIdAtom);
      return null;
    }

    render(
      <RecoilRoot>
        <Harness />
        <DatasetControl />
      </RecoilRoot>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toContain("review"),
    );

    act(() => setDatasetId?.(null));

    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toContain('"results":[]'),
    );
  });

  it("keeps the vocabulary without refetching when an editor remounts", async () => {
    fetchMock.mockResolvedValue({ response: { counts: { review: 2 } } });

    let setShown: ((value: boolean) => void) | undefined;
    function Toggle() {
      const [shown, set] = React.useState(true);
      setShown = set;
      return shown ? <Harness /> : null;
    }

    render(
      <RecoilRoot>
        <Toggle />
      </RecoilRoot>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toContain("review"),
    );

    act(() => setShown?.(false));
    act(() => setShown?.(true));

    expect(screen.getByTestId("probe").textContent).toContain("review");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes the vocabulary in place after a tag mutation", async () => {
    let resolveRefresh: (value: {
      response: { counts: Record<string, number> };
    }) => void;
    fetchMock.mockResolvedValueOnce({ response: { counts: { review: 2 } } });
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    renderSync();

    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toContain("review"),
    );

    act(() => invalidateDatasetTemporalTags("ds1"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("probe").textContent).toContain("review");

    await act(async () => {
      resolveRefresh({ response: { counts: { review: 2, created: 1 } } });
    });

    expect(screen.getByTestId("probe").textContent).toContain("created");
  });

  it("ignores a stale response from an earlier overlapping load", async () => {
    // The mount fetch stays pending while a tag mutation starts a second,
    // independent fetch. The second resolves first with fresh results; the
    // first resolving afterwards must not clobber them.
    let resolveFirst: (value: {
      response: { counts: Record<string, number> };
    }) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce({ response: { counts: { fresh: 1 } } });

    renderSync();

    act(() => invalidateDatasetTemporalTags("ds1"));

    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toContain("fresh"),
    );

    // A macrotask, not a few microtasks: the response passes through several
    // awaits before it could apply, and the assertions must run after that.
    await act(async () => {
      resolveFirst({ response: { counts: { stale: 1 } } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId("probe").textContent).toContain("fresh");
    expect(screen.getByTestId("probe").textContent).not.toContain("stale");
  });
});
