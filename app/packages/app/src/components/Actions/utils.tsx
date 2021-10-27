import { useState } from "react";
import { selector, selectorFamily } from "recoil";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import * as filterAtoms from "../Filters/atoms";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { useTheme } from "../../utils/hooks";
import { request } from "../../utils/socket";

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
    const labels = get(filterAtoms.labelTagCounts(false));
    const sample = get(filterAtoms.sampleTagCounts(false));

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
  get: ({ modal, labels }) => async ({ get }) => {
    get(atoms.stateDescription);
    get(atoms.selectedSamples);
    const activeLabels = get(activeLabelPaths(false));

    const id = uuid();
    const { count, tags } = await request<{
      count: number;
      tags: { [key: string]: number };
    }>({
      type: "tag_statistics",
      uuid: id,
      args: {
        active_labels: activeLabels,
        sample_id: modal ? get(atoms.modal).sample._id : null,
        filters: modal
          ? get(filterAtoms.modalFilterStages)
          : get(selectors.filterStages),
        labels,
      },
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
  get: ({ modal, labels }) => ({ get }) => {
    const tags = get(allTags);
    const results = tags
      ? Object.fromEntries(tags[labels ? "label" : "sample"].map((t) => [t, 0]))
      : null;

    if (!results) {
      return null;
    }

    return {
      ...results,
      ...get(tagStatistics({ modal, labels })).tags,
    };
  },
});
