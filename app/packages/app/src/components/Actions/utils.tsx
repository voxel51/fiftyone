import { useState } from "react";
import { selector, selectorFamily } from "recoil";
import { animated, useSpring } from "@react-spring/web";
import styled from "styled-components";

import * as atoms from "../../recoil/atoms";
import * as aggregationAtoms from "../../recoil/aggregations";
import * as filterAtoms from "../../recoil/filters";
import * as schemaAtoms from "../../recoil/schema";
import { hiddenLabelsArray } from "../../recoil/selectors";
import { State } from "../../recoil/types";
import { view } from "../../recoil/view";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";
import { useTheme } from "@fiftyone/components";

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
    const labels = get(
      aggregationAtoms.labelTagCounts({ modal: false, extended: false })
    );

    const sample = get(
      aggregationAtoms.sampleTagCounts({ modal: false, extended: false })
    );

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
    tags: { [key: string]: number };
  },
  { modal: boolean; labels: boolean }
>({
  key: "tagStatistics",
  get:
    ({ modal, labels: count_labels }) =>
    async ({ get }) => {
      const activeLabels = get(schemaAtoms.activeLabelFields({ modal }));
      const selected = get(atoms.selectedSamples);

      let labels: State.SelectedLabel[] = [];
      if (modal) {
        labels = Object.entries(get(atoms.selectedLabels)).map(
          ([labelId, data]) => ({
            labelId,
            ...data,
          })
        );
      }

      const { count, tags } = await getFetchFunction()("POST", "/tagging", {
        dataset: get(atoms.dataset).name,
        view: get(view),
        active_label_fields: activeLabels,
        sample_ids: selected.size
          ? [...selected]
          : modal
          ? [get(atoms.modal).sample._id]
          : null,
        labels: toSnakeCase(labels),
        count_labels,
        filters: get(modal ? filterAtoms.modalFilters : filterAtoms.filters),
        hidden_labels:
          modal && labels ? toSnakeCase(get(hiddenLabelsArray)) : null,
      });

      return { count, tags };
    },
});

export const numLabelsInSelectedSamples = selector<number>({
  key: "numLabelsInSelectedSamples",
  get: ({ get }) => {
    return get(tagStatistics({ modal: false, labels: true })).count;
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
