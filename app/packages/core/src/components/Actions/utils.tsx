import { useState } from "react";
import { selector, selectorFamily } from "recoil";
import { animated, useSpring } from "@react-spring/web";
import styled from "styled-components";

import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";
import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  currentSlice,
  groupId,
  groupStatistics,
  isGroup,
  State,
} from "@fiftyone/state";

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

export const allTags = selector<{ sample: string[]; label: string[] } | null>({
  key: "tagAggs",
  get: async ({ get }) => {
    const labels = get(fos.labelTagCounts({ modal: false, extended: false }));

    const sample = get(fos.sampleTagCounts({ modal: false, extended: false }));

    if (!labels || !sample) {
      return null;
    }

    return {
      label: Object.keys(labels).sort(),
      sample: Object.keys(sample).sort(),
    };
  },
});

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
    ({ modal, labels: count_labels }) =>
    async ({ get }) => {
      return await getFetchFunction()(
        "POST",
        "/tagging",
        tagParameters({
          activeFields: get(fos.activeLabelFields({ modal })),

          dataset: get(fos.datasetName),
          filters: get(modal ? fos.modalFilters : fos.filters),

          groupData: get(isGroup)
            ? {
                id: modal ? get(groupId) : null,
                slice: get(currentSlice(modal)),
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
          targetLabels: count_labels,
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
      const tags = get(allTags);
      const results = Object.fromEntries(
        tags[labels ? "label" : "sample"].map((t) => [t, 0])
      );

      return {
        ...results,
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
    mode: "group" | "slice";
  } | null;
  targetLabels: boolean;
  sampleId: string | null;
}) => {
  const hasSelected =
    selectedSamples.size || selectedLabels.length || hiddenLabels.length;
  const groups = groupData?.mode === "group";

  return {
    ...params,
    label_fields: activeFields,
    target_labels: targetLabels,
    slice: !params.modal && !groups ? groupData?.slice : null,
    sample_ids:
      params.modal && !hasSelected && !groups
        ? [sampleId]
        : selectedSamples.size
        ? [...selectedSamples]
        : null,
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
