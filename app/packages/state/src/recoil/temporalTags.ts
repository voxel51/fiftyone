import { getFetchFunctionExtended } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, selector, useRecoilValue, useSetRecoilState } from "recoil";
import { useActiveFilterValues } from "./filters";
import { isModalActive } from "./modal";
import { activeField } from "./schema";
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
  const modalActive = useRecoilValue(isModalActive);
  const wasModalActive = useRef(modalActive);

  // Shared across both call sites below (mount/dataset-change and
  // modal-close), which can overlap: the dataset-change effect can still be
  // in flight when the modal closes and re-triggers `load`. A `cancelled`
  // flag scoped to a single call can't see a *later* call — only this
  // counter, bumped by every call, can tell an in-flight response that it is
  // no longer the latest one and let it drop its result instead of
  // clobbering fresher data.
  const requestGenerationRef = useRef(0);

  const load = useCallback(() => {
    const generation = ++requestGenerationRef.current;
    const isStale = () => requestGenerationRef.current !== generation;

    if (!currentDatasetId) {
      // No active dataset — clear any stale results from a prior one.
      setResults({ results: [], count: null });
      return;
    }

    // Clear the prior dataset's results immediately — otherwise
    // `useTemporalTagValues` keeps returning the old dataset's vocabulary
    // until this fetch resolves.
    setResults({ results: [], count: null });

    fetchTemporalTagResults(currentDatasetId)
      .then((results) => {
        if (!isStale()) {
          setResults(results);
        }
      })
      .catch(() => {
        if (!isStale()) {
          setResults({ results: [], count: null });
        }
      });
    // `setResults` is a stable Recoil setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDatasetId]);

  // Initial load and on dataset change.
  useEffect(() => load(), [load]);

  // Re-fetch when the modal closes: a tag may have been created / edited /
  // deleted in the modal, so the grid's tag list is stale until we refresh.
  useEffect(() => {
    const closed = wasModalActive.current && !modalActive;
    wasModalActive.current = modalActive;
    if (closed) load();
  }, [modalActive, load]);
};

const NO_VALUES: string[] = [];

/** Whether the temporal-tags pseudo-field is enabled in the grid sidebar. */
export const useTemporalTagsFieldActive = (): boolean =>
  useRecoilValue(activeField({ modal: false, path: TEMPORAL_TAGS_FIELD }));

/**
 * Every temporal-tag value defined on the current dataset. Populated by
 * {@link useSyncTemporalTagResults}; empty until that has run, so callers
 * that need it should call the sync hook too.
 */
export const useTemporalTagValues = (): string[] => {
  const { results } = useRecoilValue(temporalTagResults);
  return useMemo(() => {
    const values = results
      .map(({ value }) => value)
      .filter((value): value is string => !!value);
    return values.length ? values : NO_VALUES;
  }, [results]);
};

/**
 * Tag values the grid is currently filtering *for* via the temporal-tags
 * filter — inclusive selections only (empty when the filter is unset or set to
 * exclude). Used to auto-pin the matching timeline tracks when a sample is
 * opened from a temporal-tag-filtered grid.
 *
 * Nothing here is tag-specific beyond the path, so the body lives in
 * `filters.ts` as {@link useActiveFilterValues} and is shared with the other
 * interval sources that pin the same way.
 */
export const useActiveTemporalTagFilterValues = (): string[] =>
  useActiveFilterValues(TEMPORAL_TAGS_FIELD);
