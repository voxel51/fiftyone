import { PillButton } from "@fiftyone/components";
import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { Bookmark } from "@mui/icons-material";
import React from "react";
import { selector, useRecoilCallback, useRecoilValue } from "recoil";
import Loading from "../../../Actions/Loading";
import type { ActionProps } from "../../../Actions/types";
import { ActionDiv, getStringAndNumberProps } from "../../../Actions/utils";

export const shouldToggleBookMarkIconOnSelector = selector<boolean>({
  key: "shouldToggleBookMarkIconOn",
  get: ({ get }) => {
    const hasFiltersValue = get(fos.hasFilters(false));
    const { selection } = get(fos.extendedSelection) ?? {};
    const selectedSampleSet = get(fos.selectedSamples);
    const isSimilarityOn = get(fos.similarityParameters);

    const excludedFields = get(fos.excludedPathsState({}));
    const datasetName = get(fos.datasetName);
    const affectedPathCount = datasetName
      ? excludedFields?.[datasetName]?.size
      : 0;

    const isAttributeVisibilityOn = affectedPathCount > 0;

    const isExtendedSelectionOn =
      (selection && selection.length > 0) || isSimilarityOn;

    return Boolean(
      isExtendedSelectionOn ||
        hasFiltersValue ||
        selectedSampleSet.size > 0 ||
        isAttributeVisibilityOn ||
        get(fos.gridSortBy)
    );
  },
});

export default ({ adaptiveMenuItemProps }: ActionProps) => {
  const loading = useRecoilValue(fos.savingFilters);

  const saveFilters = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        const loading = await snapshot.getPromise(fos.savingFilters);
        const selected = await snapshot.getPromise(fos.selectedSamples);
        const fvStage = await snapshot.getPromise(fos.fieldVisibilityStage);
        const datasetId = (await snapshot.getPromise(fos.datasetId)) || "";

        if (loading) {
          return;
        }

        const unsubscribe = subscribe((_, { set, reset }) => {
          set(fos.savingFilters, false);
          reset(fos.extendedSelection);
          reset(fos.viewStateForm_INTERNAL);
          reset(fos.gridSortByStore(datasetId));
          reset(fos.gridSortDescendingStore(datasetId));
          unsubscribe();
        });

        set(fos.savingFilters, true);
        set(fos.viewStateForm_INTERNAL, {
          filters: await snapshot.getPromise(fos.filters),
          extended: await snapshot.getPromise(fos.extendedStages),
        });
        if (selected.size > 0) {
          set(fos.view, (v) => [
            ...v,
            {
              _cls: "fiftyone.core.stages.Select",
              kwargs: [["sample_ids", [...selected]]],
            } as fos.State.Stage,
          ]);
        } else {
          set(fos.view, (v) => v);
        }

        const fvFieldNames = fvStage?.kwargs?.field_names;
        if (fvFieldNames) {
          set(fos.view, (v) => [
            ...v,
            {
              _cls: "fiftyone.core.stages.ExcludeFields",
              kwargs: [["field_names", [...fvFieldNames]]],
            } as fos.State.Stage,
          ]);
        }
      },
    []
  );

  const shouldToggleBookMarkIconOn = useRecoilValue(
    shouldToggleBookMarkIconOnSelector
  );

  return shouldToggleBookMarkIconOn ? (
    <ActionDiv {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}>
      <PillButton
        open={false}
        highlight={true}
        icon={loading ? <Loading /> : <Bookmark />}
        style={{ cursor: loading ? "default" : "pointer" }}
        onClick={saveFilters}
        title={"Convert current filters and/or sorting to view stages"}
        data-cy="action-convert-filters-to-view-stages"
      />
    </ActionDiv>
  ) : null;
};
