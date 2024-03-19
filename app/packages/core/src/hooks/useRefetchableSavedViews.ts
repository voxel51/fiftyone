import {
  savedViewsFragment,
  savedViewsFragment$key,
  savedViewsFragmentQuery,
} from "@fiftyone/relay";
import { datasetQueryContext } from "@fiftyone/state";
import { useContext } from "react";
import { useRefetchableFragment } from "react-relay";

export default function useRefetchableSavedViews() {
  const fragmentRef = useContext(datasetQueryContext);

  if (!fragmentRef) throw new Error("ref not defined");

  const [data, refetch] = useRefetchableFragment<
    savedViewsFragmentQuery,
    savedViewsFragment$key
  >(savedViewsFragment, fragmentRef);

  return [data, refetch];
}
