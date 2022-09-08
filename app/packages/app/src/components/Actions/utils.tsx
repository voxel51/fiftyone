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
  sidebarSampleId,
} from "@fiftyone/state";

export const SwitcherDiv = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.background};
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
  border-bottom-color: ${({ theme }) => theme.brand};
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
    backgroundColor: on
      ? theme.backgroundLight
      : disabled
      ? theme.backgroundDark
      : theme.backgroundDark,
    color: color ? color : on ? theme.font : theme.fontDark,
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
      const activeLabels = get(fos.activeLabelFields({ modal }));
      const selected = get(fos.selectedSamples);

      let labels: fos.State.SelectedLabel[] = [];
      if (modal) {
        labels = Object.entries(get(fos.selectedLabels)).map(
          ([labelId, data]) => ({
            labelId,
            ...data,
          })
        );
      }

      const groupStats = get(groupStatistics(modal)) === "group";

      return await getFetchFunction()("POST", "/tagging", {
        dataset: get(fos.dataset).name,
        view: get(fos.view),
        active_label_fields: activeLabels,
        sample_ids: selected.size
          ? [...selected]
          : modal && !groupStats
          ? get(sidebarSampleId)
          : null,
        labels: toSnakeCase(labels),
        group_id: modal && !selected.size && groupStats ? get(groupId) : null,
        slice: groupStats ? null : get(currentSlice(modal)),
        count_labels,
        filters: get(modal ? fos.modalFilters : fos.filters),
        mixed: groupStats,
        hidden_labels:
          modal && labels ? toSnakeCase(get(fos.hiddenLabelsArray)) : null,
      });
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
