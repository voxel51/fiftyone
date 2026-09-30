import { atom, getDefaultStore, useAtomValue } from "jotai";

/** Group ID to the names of its slices that matched, best match first. */
export type GroupMatches = ReadonlyMap<string, readonly string[]>;

const matchesAtom = atom<{ value: GroupMatches | null }>({ value: null });

/**
 * The matched slices of a search that selects groups without a
 * `SortBySimilarity` stage to record them, such as a search run in the
 * browser. Its publisher clears them together with its selection.
 */
export const groupMatchesBridge = {
  publish(matches: GroupMatches | null) {
    getDefaultStore().set(matchesAtom, { value: matches });
  },
};

/** The matches last published through {@link groupMatchesBridge}. */
export function usePublishedGroupMatches(): GroupMatches | null {
  return useAtomValue(matchesAtom, { store: getDefaultStore() }).value;
}
