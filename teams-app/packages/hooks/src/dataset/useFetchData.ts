import { useRecoilCallback } from "recoil";
import { view } from "@fiftyone/state";
import { useState, useCallback } from "react";
import { isObjectEmpty } from "@fiftyone/teams-utilities/src/isObjectEmpty";
import { ViewSelectors } from "@fiftyone/teams-state/src/Dataset/__generated__/DatasetCloneViewMutation.graphql";
import { currentDatasetFilters } from "./useCurrentFilters";

export function useFetchData(setType: (type: string) => void) {
  const getView = useRecoilCallback(
    ({ snapshot }) =>
      async () =>
        snapshot.getPromise(view),
    []
  );

  const getForm = useRecoilCallback(
    ({ snapshot }) =>
      async () =>
        snapshot.getPromise(currentDatasetFilters),
    []
  );

  const [sourceView, setSourceView] = useState<ViewSelectors | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const view = await getView();
      const form = await getForm();
      const sourceViewData = {
        filters: form?.filters || {},
        sampleIds: form?.sampleIds || [],
        viewStages: view || [],
      } as ViewSelectors;
      setSourceView(sourceViewData);
      setType(isObjectEmpty(sourceViewData) ? "dataset" : "view");
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [getView, getForm, setType]);

  return { sourceView, fetchData };
}
