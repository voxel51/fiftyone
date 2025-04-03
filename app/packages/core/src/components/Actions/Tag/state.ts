import * as fos from "@fiftyone/state";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";
import { selectorFamily } from "recoil";

/**
 * Returns true if filters should be omitted from tag parameters
 *
 * @param modal is modal context
 * @param selectedSamples selected samples set
 */
export const overrideFilters = (
  modal: boolean,
  selectedSamples: Set<string>
) => {
  return modal && !!selectedSamples.size;
};

export const tagStatistics = selectorFamily<
  {
    count: number;
    items: number;
    tags: { [key: string]: number };
  },
  { modal: boolean; labels: boolean }
>({
  key: "tagStatistics",
  get:
    ({ modal, labels: countLabels }) =>
    async ({ get }) => {
      return await getFetchFunction()(
        "POST",
        "/tagging",
        tagParameters({
          activeFields: get(fos.activeLabelFields({ modal })),
          dataset: get(fos.datasetName),
          filters: get(modal ? fos.modalFilters : fos.filters),
          groupData:
            get(fos.isGroup) && get(fos.groupField)
              ? {
                  id: modal ? get(fos.groupId) : null,
                  currentSlices: get(fos.currentSlices(modal)),
                  mode: get(fos.groupStatistics(modal)),
                  slice: get(fos.currentSlice(modal)),
                  slices: get(fos.groupSlices),
                }
              : null,
          hiddenLabels: get(fos.hiddenLabelsArray),
          modal,
          sampleId: modal ? get(fos.sidebarSampleId) : null,
          selectedSamples: get(fos.selectedSamples),
          selectedLabels: get(fos.selectedLabels),
          targetLabels: countLabels,
          view: get(fos.view),
          extended: !modal ? get(fos.extendedStages) : null,
        })
      );
    },
});

export const numItemsInSelection = selectorFamily<
  number,
  { modal: boolean; labels: boolean }
>({
  key: "numLabelsInSelectedSamples",
  get:
    ({ modal = false, labels }) =>
    ({ get }) => {
      return get(tagStatistics({ modal, labels })).count;
    },
});

export const selectedSamplesCount = selectorFamily<number, boolean>({
  key: "selectedSampleCount",
  get:
    (modal) =>
    ({ get }) => {
      return get(tagStatistics({ modal, labels: false })).items;
    },
});

export const tagStats = selectorFamily<
  { [key: string]: number } | null,
  { modal: boolean; labels: boolean }
>({
  key: "tagStats",
  get:
    ({ modal, labels }) =>
    ({ get }) => {
      const data = modal
        ? []
        : Object.keys(
            get(
              labels
                ? fos.labelTagCounts({ modal: false, extended: false })
                : fos.sampleTagCounts({ modal: false, extended: false })
            )
          ).map((t) => [t, 0]);

      return {
        ...Object.fromEntries(data),
        ...get(tagStatistics({ modal, labels })).tags,
      };
    },
});

export const tagParameters = ({
  sampleId,
  targetLabels,
  hiddenLabels,
  activeFields,
  selectedSamples,
  selectedLabels,
  groupData,
  ...params
}: {
  dataset: string;
  modal: boolean;
  view: fos.State.Stage[];
  filters: fos.State.Filters;
  selectedSamples: Set<string>;
  selectedLabels: fos.State.SelectedLabel[];
  hiddenLabels: fos.State.SelectedLabel[];
  activeFields: string[];
  groupData: {
    id: string | null;
    currentSlices: string[] | null;
    slice: string | null;
    slices: string[] | null;
    mode: "group" | "slice";
  } | null;
  targetLabels: boolean;
  sampleId: string | null;
}) => {
  const shouldShowCurrentSample =
    params.modal && selectedSamples.size === 0 && hiddenLabels.length === 0;
  const groups = groupData?.mode === "group";
  if (groupData && !groups) {
    groupData.slices = groupData.currentSlices;
  }

  const getSampleIds = () => {
    if (shouldShowCurrentSample && !groups) {
      if (groupData?.slices) {
        return null;
      }
      if (targetLabels && selectedLabels.length) {
        return [...new Set(selectedLabels.map((l) => l.sampleId))];
      }
      return [sampleId];
    }
    if (selectedSamples.size) {
      return [...selectedSamples];
    }

    return null;
  };

  return {
    ...params,
    filters: overrideFilters(params.modal, selectedSamples)
      ? {}
      : params.filters,
    label_fields: activeFields,
    target_labels: targetLabels,
    slices: groupData?.slices,
    slice: groupData?.slice,
    group_id: params.modal ? groupData?.id : null,
    sample_ids: getSampleIds(),
    labels:
      params.modal && targetLabels && selectedLabels && selectedLabels.length
        ? toSnakeCase(selectedLabels)
        : null,
    hidden_labels:
      params.modal && targetLabels && hiddenLabels.length
        ? toSnakeCase(hiddenLabels)
        : null,
  };
};
