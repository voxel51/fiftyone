import {
  savedViewsFragment,
  savedViewsFragment$data,
  savedViewsFragment$key,
  savedViewsFragmentQuery,
} from "@fiftyone/relay";
import { datasetQueryContext } from "@fiftyone/state";
import { useContext } from "react";
import { RefetchFnDynamic, useRefetchableFragment } from "react-relay";

// Mirror the exact refetch signature Relay produces for this fragment so the
// no-provider branch stays type-compatible with the real one — callers do
// `refetch({ name }, { fetchPolicy, onComplete })`.
type SavedViewsRefetch = RefetchFnDynamic<
  savedViewsFragmentQuery,
  savedViewsFragment$key
>;

// Both return paths of the hook resolve to this same tuple shape.
type RefetchableSavedViews = [savedViewsFragment$data, SavedViewsRefetch];

// The no-provider branch never actually refetches, so accept the real
// `(variables, options?)` arguments and return a Relay `Disposable` whose
// `dispose()` is a no-op.
const NOOP_REFETCH: SavedViewsRefetch = () => ({ dispose: () => {} });

export default function useRefetchableSavedViews(): RefetchableSavedViews {
  const fragmentRef = useContext(datasetQueryContext);

  // Some hosts run operators without mounting a ``datasetQueryContext``
  // provider (saved views only exist on the samples dataset page). Return
  // an empty, no-op result here instead of throwing — otherwise those hosts
  // crash with "ref not defined" the moment any operator's ``useHooks``
  // (e.g. ``set_view``) is evaluated.
  if (!fragmentRef) {
    return [
      { savedViews: [] },
      NOOP_REFETCH,
    ] as unknown as RefetchableSavedViews;
  }

  return useRefetchableFragment<
    savedViewsFragmentQuery,
    savedViewsFragment$key
  >(savedViewsFragment, fragmentRef);
}
