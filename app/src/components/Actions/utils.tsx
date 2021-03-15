import { useState } from "react";
import { selectorFamily } from "recoil";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";

import { activeLabels } from "../Filters/utils";
import { labelCount } from "../Filters/LabelFieldFilters.state";
import * as selectors from "../../recoil/selectors";
import { useTheme } from "../../utils/hooks";

export const HoverItemDiv = animated(styled.div`
  cursor: pointer;
  margin: 0.25rem -0.5rem;
  padding: 0.25rem 0.5rem;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  color: ${({ theme }) => theme.fontDark};
`);

export const useHighlightHover = (disabled, forceOn) => {
  const [hovering, setHovering] = useState(false);
  const theme = useTheme();
  const on = (hovering || forceOn) && !disabled;
  const style = useSpring({
    backgroundColor: on
      ? theme.backgroundLight
      : disabled
      ? theme.backgroundDarker
      : theme.backgroundDark,
    color: on ? theme.font : theme.fontDark,
  });

  const onMouseEnter = () => setHovering(true);

  const onMouseLeave = () => setHovering(false);

  return {
    style: {
      ...style,
      cursor: disabled ? "disabled" : "pointer",
    },
    onMouseEnter,
    onMouseLeave,
  };
};

export const numTaggable = selectorFamily<
  number | null,
  { modal: boolean; labels: boolean }
>({
  key: "numTaggable",
  get: ({ modal, labels }) => ({ get }) => {
    if (labels) {
      return get(labelCount(modal));
    } else if (modal) {
      return 1;
    } else {
      return (
        get(selectors.filteredTagSampleCounts) ?? get(selectors.tagSampleCounts)
      );
    }
  },
});

export const tagStats = selectorFamily<
  { [key: string]: number },
  { modal: boolean; labels: boolean }
>({
  key: "tagStates",
  get: ({ modal, labels }) => ({ get }) => {
    if (modal && labels) {
    } else if (modal) {
    } else if (labels) {
      const active = [
        ...get(activeLabels({ modal, frames: true })),
        ...get(activeLabels({ modal, frames: true })).map((l) => `frames.${l}`),
      ];
      const stats =
        get(selectors.datasetStats) || get(selectors.extendedDatasetStats);
      if (!stats) return {};

      const counts = active.map((l) => [`${l}.tags`, stats[`${l}.tags`]]);
      return counts.reduce((acc, [k, v]) => {
        acc[k] = acc[k] ? acc[k] : 0;
        acc[k] += v;
        return acc;
      }, {});
    } else {
      return get(selectors.tagSampleCounts);
    }
  },
});
