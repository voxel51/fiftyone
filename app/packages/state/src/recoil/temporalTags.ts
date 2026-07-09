import { getFetchFunctionExtended } from "@fiftyone/utilities";
import { useEffect, useMemo } from "react";
import { atom, selector, useRecoilValue, useSetRecoilState } from "recoil";
import { filters } from "./filters";
import { datasetId } from "./selectors";
import { TEMPORAL_TAGS_FIELD } from "./sidebar";

/** One selectable temporal-tag value and its occurrence count. */
export interface TemporalTagResult {
  value: string | null;
  count: number | null;
}

/** Shape consumed by the string filter's `resultsAtom`. */
export interface TemporalTagResults {
  results: TemporalTagResult[];
  count: number | null;
}

/**
 * Available temporal-tag values (with counts) for the current dataset. A plain
 * atom (rather than an async selector) so reading it never suspends the
 * sidebar. Kept private — exposed only through the read selector + sync hook
 * below so the atom stays an implementation detail.
 */
const temporalTagResultsAtom = atom<TemporalTagResults>({
  key: "temporalTagResultsAtom",
  default: { results: [], count: null },
});

/**
 * Read-only view of the temporal-tag results, exposed as the string filter's
 * `resultsAtom` (a RecoilValue, mirroring `labelTagsCount`). Populate it via
 * {@link useSyncTemporalTagResults}.
 */
export const temporalTagResults = selector<TemporalTagResults>({
  key: "temporalTagResults",
  get: ({ get }) => get(temporalTagResultsAtom),
});

type TemporalTagCountsResponse = { counts: Record<string, number> };

/**
 * Fetches temporal-tag value counts for a dataset from the multimodal tags
 * REST endpoint and shapes them for the string filter. Mirrors the
 * `@fiftyone/multimodal` client's `countDatasetTemporalTags` — duplicated here
 * because `@fiftyone/state` cannot depend on `@fiftyone/multimodal`.
 */
export const fetchTemporalTagResults = async (
  datasetId: string,
): Promise<TemporalTagResults> => {
  const fetchFunction = getFetchFunctionExtended();
  const { response } = await fetchFunction<
    undefined,
    TemporalTagCountsResponse
  >({
    method: "GET",
    // `by_sample=true` counts distinct samples per tag (a sample with multiple
    // intervals of the same tag counts once), matching what selecting the value
    // filters the grid to.
    path: `/dataset/${encodeURIComponent(datasetId)}/tags/counts?by_sample=true`,
  });

  const results = Object.entries(response.counts ?? {}).map(
    ([value, count]) => ({ value, count }),
  );
  const count = results.reduce((acc, { count }) => acc + (count ?? 0), 0);

  return { results, count };
};

/**
 * Loads temporal-tag value counts for the active dataset into the results atom.
 * Encapsulates all Recoil + fetch access so the filter component never touches
 * atoms directly. Call once from the temporal-tags sidebar filter.
 */
export const useSyncTemporalTagResults = (): void => {
  const currentDatasetId = useRecoilValue(datasetId);
  const setResults = useSetRecoilState(temporalTagResultsAtom);

  useEffect(() => {
    if (!currentDatasetId) {
      // No active dataset — clear any stale results from a prior one.
      setResults({ results: [], count: null });
      return undefined;
    }

    let cancelled = false;
    fetchTemporalTagResults(currentDatasetId)
      .then((results) => {
        if (!cancelled) {
          setResults(results);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResults({ results: [], count: null });
        }
      });

    return () => {
      cancelled = true;
    };
    // `setResults` is a stable Recoil setter; re-run only when the dataset changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDatasetId]);
};

const NO_VALUES: string[] = [];

/**
 * Tag values the grid is currently filtering *for* via the temporal-tags
 * filter — inclusive selections only (empty when the filter is unset or set to
 * exclude). Used to auto-pin the matching timeline tracks when a sample is
 * opened from a temporal-tag-filtered grid.
 */
export const useActiveTemporalTagFilterValues = (): string[] => {
  const current = useRecoilValue(filters);
  return useMemo(() => {
    const filter = current?.[TEMPORAL_TAGS_FIELD] as
      | { values?: (string | null)[]; exclude?: boolean }
      | undefined;
    if (!filter || filter.exclude) {
      return NO_VALUES;
    }
    const values = (filter.values ?? []).filter(
      (value): value is string => typeof value === "string",
    );
    return values.length ? values : NO_VALUES;
  }, [current]);
};
