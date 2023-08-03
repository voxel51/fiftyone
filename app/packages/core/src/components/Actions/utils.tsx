import { animated, useSpring } from "@react-spring/web";
import { useState } from "react";
import { selectorFamily } from "recoil";
import styled from "styled-components";

import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { groupId, groupStatistics, isGroup, State } from "@fiftyone/state";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";

export const SwitcherDiv = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.background.body};
  display: flex;
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
`;

export const SwitchDiv = animated(styled.div`
  flex-basis: 0;
  flex-grow: 1;
  font-size: 1rem;
  padding-left: 0.4rem;
  line-height: 2;
  font-weight: bold;
  border-bottom-color: ${({ theme }) => theme.primary.plainColor};
  border-bottom-style: solid;
  border-bottom-width: 2px;
  text-transform: capitalize;
`);

export const useHighlightHover = (disabled, override = null, color = null) => {
  const [hovering, setHovering] = useState(false);
  const theme = useTheme();
  const on =
    typeof override === "boolean"
      ? override && !disabled
      : hovering && !disabled;
  const style = useSpring({
    backgroundColor: on ? theme.background.level1 : theme.background.level2,
    color: color ? color : on ? theme.text.primary : theme.text.secondary,
  });

  const onMouseEnter = () => setHovering(true);

  const onMouseLeave = () => setHovering(false);

  return {
    style: {
      ...style,
      cursor: disabled ? "default" : "pointer",
    },
    onMouseEnter,
    onMouseLeave,
  };
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
            get(isGroup) && get(fos.groupField)
              ? {
                  id: modal ? get(groupId) : null,
                  slices: get(fos.currentSlices(modal)),
                  mode: get(groupStatistics(modal)),
                }
              : null,
          hiddenLabels: get(fos.hiddenLabelsArray),
          modal,
          sampleId: modal ? get(fos.sidebarSampleId) : null,
          selectedSamples: get(fos.selectedSamples),
          selectedLabels: Object.entries(get(fos.selectedLabels)).map(
            ([labelId, data]) => ({
              labelId,
              ...data,
            })
          ),
          targetLabels: countLabels,
          view: get(fos.view),
        })
      );
    },
});

export const numItemsInSelection = selectorFamily<number, boolean>({
  key: "numLabelsInSelectedSamples",
  get:
    (labels) =>
    ({ get }) => {
      return get(tagStatistics({ modal: false, labels })).count;
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
      const data = Object.keys(
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
  view: State.Stage[];
  filters: State.Filters;
  selectedSamples: Set<string>;
  selectedLabels: State.SelectedLabel[];
  hiddenLabels: State.SelectedLabel[];
  activeFields: string[];
  groupData: {
    id: string | null;
    slice: string | null;
    slices: string[] | null;
    mode: "group" | "slice";
  } | null;
  targetLabels: boolean;
  sampleId: string | null;
}) => {
  const shouldShowCurrentSample =
    params.modal && selectedSamples.size == 0 && hiddenLabels.length == 0;
  const groups = groupData?.mode === "group";

  const getSampleIds = () => {
    if (shouldShowCurrentSample && !groups) {
      if (groupData?.slices) {
        return null;
      }
      return [sampleId];
    } else if (selectedSamples.size) {
      return [...selectedSamples];
    }
    return null;
  };

  return {
    ...params,
    label_fields: activeFields,
    target_labels: targetLabels,
    slices: !groups ? groupData?.slices : null,
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
