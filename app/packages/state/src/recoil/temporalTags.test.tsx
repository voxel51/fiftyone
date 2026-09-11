import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import {
  RecoilRoot,
  useRecoilValue,
  useSetRecoilState,
  type RecoilState,
} from "recoil";
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
vi.mock("./modal", async () => {
  const { atom } = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    isModalActive: atom<boolean>({
      key: "test_isModalActive",
      default: false,
    }),
  };
});

import { filters as filtersAtom } from "./filters";
import { isModalActive } from "./modal";
import { datasetId as datasetIdAtom } from "./selectors";

// The real `isModalActive` is a read-only selector; the mock above swaps it
// for a plain atom so the test can drive it, but the import still carries
// the selector's type — a targeted cast at this one declaration site is
// simpler than re-typing the mock.
const isModalActiveAtom = isModalActive as unknown as RecoilState<boolean>;
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

  it("hits the dataset tags counts endpoint (by sample) with an encoded id", async () => {
    fetchMock.mockResolvedValue({ response: { counts: {} } });

    await fetchTemporalTagResults("my dataset/1");

    expect(fetchMock).toHaveBeenCalledWith({
      method: "GET",
      path: "/dataset/my%20dataset%2F1/tags/counts?by_sample=true",
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

  it("ignores a stale response from an earlier overlapping load", async () => {
    // The mount effect starts a fetch that stays pending while the modal
    // opens and closes, which starts a second, independent fetch. The second
    // resolves first with fresh results; the first resolving afterwards must
    // not clobber them with what it fetched before the modal round-trip.
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

    let setModalActive: ((value: boolean) => void) | undefined;
    function ModalControl() {
      setModalActive = useSetRecoilState(isModalActiveAtom);
      return null;
    }

    render(
      <RecoilRoot>
        <Harness />
        <ModalControl />
      </RecoilRoot>,
    );

    act(() => setModalActive?.(true));
    act(() => setModalActive?.(false));

    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toContain("fresh"),
    );

    resolveFirst({ response: { counts: { stale: 1 } } });

    // Give the stale promise a turn to resolve and (incorrectly) apply.
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByTestId("probe").textContent).toContain("fresh");
    expect(screen.getByTestId("probe").textContent).not.toContain("stale");
  });
});
