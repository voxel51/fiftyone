import { useEffect, useMemo } from "react";
import {
  DefaultValue,
  atom,
  selector,
  selectorFamily,
  useRecoilCallback,
  useRecoilValue,
} from "recoil";
import {
  createTemporalTagsClient,
  onTemporalTagsMutated,
} from "../temporal-tags";
import { useActiveFilterValues } from "./filters";
import { counts } from "./pathData/counts";
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
 * Every temporal-tag value defined on the current dataset, with its count over
 * the whole dataset: the vocabulary a tag editor offers. A plain atom (rather
 * than an async selector) so reading it never suspends. Kept private — exposed
 * only through the read selector + sync hook below so the atom stays an
 * implementation detail.
 */
const NO_RESULTS: TemporalTagResults = { results: [], count: null };

const temporalTagResultsAtom = atom<TemporalTagResults>({
  key: "temporalTagResultsAtom",
  default: NO_RESULTS,
});

/** The dataset whose vocabulary `temporalTagResultsAtom` holds. */
const temporalTagResultsDatasetAtom = atom<string | null>({
  key: "temporalTagResultsDatasetAtom",
  default: null,
});

// Shared by every editor that loads the vocabulary, so a response that is no
// longer the latest request, from any of them, is dropped rather than
// overwriting fresher results.
let latestVocabularyRequest = 0;

/**
 * Read-only view of the dataset's temporal-tag vocabulary. Populate it via
 * {@link useSyncTemporalTagResults}. The sidebar's counts are not these; they
 * are {@link temporalTagCounts}, scoped to the view.
 */
export const temporalTagResults = selector<TemporalTagResults>({
  key: "temporalTagResults",
  get: ({ get }) => get(temporalTagResultsAtom),
});

/** Fetches the temporal-tag vocabulary of a dataset, with counts. */
export const fetchTemporalTagResults = async (
  datasetId: string,
): Promise<TemporalTagResults> => {
  const tagCounts = await createTemporalTagsClient().countDatasetTemporalTags({
    datasetId,
  });

  const results = Object.entries(tagCounts ?? {}).map(([value, count]) => ({
    value,
    count,
  }));
  const count = results.reduce((acc, { count }) => acc + (count ?? 0), 0);

  return { results, count };
};

/**
 * Bumped after every temporal tag mutation. Temporal tags are not sample
 * fields, so no other input to their aggregation changes when one is created,
 * edited or deleted; this is what refetches it.
 */
export const temporalTagsRevision = atom<number>({
  key: "temporalTagsRevision",
  default: 0,
  effects: [
    ({ setSelf }) =>
      onTemporalTagsMutated(() =>
        setSelf(
          (revision) => (revision instanceof DefaultValue ? 0 : revision) + 1,
        ),
      ),
  ],
});

/**
 * The temporal-tag values on the samples in view, with how many intervals
 * each has there, shaped for the string filter's `resultsAtom`. Scoped like
 * every other sidebar count: the view, the active slice, and with `extended`
 * the filters.
 */
export const temporalTagCounts = selectorFamily<
  TemporalTagResults,
  { modal: boolean; extended: boolean }
>({
  key: "temporalTagCounts",
  get:
    (params) =>
    ({ get }) => {
      const results = Object.entries(
        get(counts({ ...params, path: TEMPORAL_TAGS_FIELD })),
      ).map(([value, count]) => ({ value, count }));

      return {
        results,
        count: results.reduce((acc, { count }) => acc + count, 0),
      };
    },
});

/**
 * Loads the active dataset's temporal-tag vocabulary into the results atom,
 * once per dataset, and refreshes it after every temporal tag mutation. Call
 * from each tag editor that offers the existing values.
 */
export const useSyncTemporalTagResults = (): void => {
  const currentDatasetId = useRecoilValue(datasetId);

  const load = useRecoilCallback(
    ({ set }) =>
      (targetDatasetId: string) => {
        const request = ++latestVocabularyRequest;
        fetchTemporalTagResults(targetDatasetId)
          .then((results) => {
            if (request === latestVocabularyRequest) {
              set(temporalTagResultsAtom, results);
            }
          })
          .catch(() => {
            // Keep what is shown, and let the next editor mount retry.
            if (request === latestVocabularyRequest) {
              set(temporalTagResultsDatasetAtom, null);
            }
          });
      },
    [],
  );

  // An editor mounting for a dataset whose vocabulary is already held neither
  // clears it nor refetches it.
  const sync = useRecoilCallback(
    ({ snapshot, set }) =>
      () => {
        const loadedFor = snapshot
          .getLoadable(temporalTagResultsDatasetAtom)
          .getValue();
        if (loadedFor === currentDatasetId) return;

        set(temporalTagResultsDatasetAtom, currentDatasetId);
        set(temporalTagResultsAtom, NO_RESULTS);
        if (currentDatasetId) {
          load(currentDatasetId);
        } else {
          ++latestVocabularyRequest;
        }
      },
    [currentDatasetId, load],
  );

  useEffect(() => sync(), [sync]);

  // A created, renamed or deleted tag changes the vocabulary; refresh it in
  // place so the editor never offers an empty list meanwhile.
  useEffect(() => {
    if (!currentDatasetId) return undefined;

    return onTemporalTagsMutated(() => load(currentDatasetId));
  }, [currentDatasetId, load]);
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
