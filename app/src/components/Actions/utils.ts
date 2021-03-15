import { selectorFamily } from "recoil";
import { animated } from "react-spring";
import styled from "styled-components";

import { activeLabels } from "../Filters/utils";
import * as selectors from "../../recoil/selectors";

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
