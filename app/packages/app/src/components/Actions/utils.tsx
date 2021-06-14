import { useState } from "react";
import { selector, selectorFamily } from "recoil";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";

import { activeLabelPaths, activeLabels } from "../Filters/utils";
import {
  labelCount,
  sampleModalFilter,
} from "../Filters/LabelFieldFilters.state";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { useTheme } from "../../utils/hooks";
import { packageMessage } from "../../utils/socket";
import socket from "../../shared/connection";
import {
  VALID_LABEL_TYPES,
  VALID_LIST_TYPES,
  LABEL_LIST,
} from "../../utils/labels";

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

export const allTags = selector<{ sample: string[]; label: string[] }>({
  key: "tagAggs",
  get: async ({ get }) => {
    const state = get(atoms.stateDescription);

    const wrap = (handler, type) => ({ data }) => {
      data = JSON.parse(data);
      data.type === type && handler(data);
    };

    const promise = new Promise<{ sample: string[]; label: string[] }>(
      (resolve) => {
        const listener = wrap(({ sample, label }) => {
          socket.removeEventListener("message", listener);
          resolve({ sample: sample.sort(), label: label.sort() });
        }, "all_tags");
        socket.addEventListener("message", listener);
        socket.send(packageMessage("all_tags", {}));
      }
    );

    const result = await promise;
    return result;
  },
});

export const selectedSampleLabelStatistics = selector<{
  count: number;
  tags: { [key: string]: number };
}>({
  key: "selectedSampleLabelStatistics",
  get: async ({ get }) => {
    const state = get(atoms.stateDescription);
    const activeLabels = get(activeLabelPaths(false));

    const wrap = (handler, type) => ({ data }) => {
      data = JSON.parse(data);
      data.type === type && handler(data);
    };

    const promise = new Promise<{
      count: number;
      tags: { [key: string]: number };
    }>((resolve) => {
      const listener = wrap(({ count, tags }) => {
        socket.removeEventListener("message", listener);
        resolve({ count, tags });
      }, "selected_statistics");
      socket.addEventListener("message", listener);
      socket.send(
        packageMessage("selected_statistics", { active_labels: activeLabels })
      );
    });

    const result = await promise;
    return result;
  },
});

export const numLabelsInSelectedSamples = selector<number>({
  key: "numLabelsInSelectedSamples",
  get: ({ get }) => {
    return get(selectedSampleLabelStatistics).count;
  },
});

const addLabelToTagsResult = (result, label, label_id = null) => {
  const add = (l) => {
    if (label_id && l._id !== label_id) return;
    l.tags &&
      l.tags.forEach((t) => {
        result[t] = t in result ? result[t] + 1 : 1;
      });
  };
  if (VALID_LIST_TYPES.includes(label._cls)) {
    label[LABEL_LIST[label._cls]] && label[LABEL_LIST[label._cls]].forEach(add);
  } else {
    add(label);
  }
};

export const tagStats = selectorFamily<
  { [key: string]: number },
  { modal: boolean; labels: boolean }
>({
  key: "tagStats",
  get: ({ modal, labels }) => ({ get }) => {
    if (modal && labels) {
      return {};
    } else if (modal) {
      return {};
    } else if (labels) {
      const types = get(selectors.labelTypesMap);
      const active = [
        ...get(activeLabels({ modal, frames: false })),
        ...get(activeLabels({ modal, frames: true })),
      ].map((l) =>
        LABEL_LIST[types[l]] ? `${l}.${LABEL_LIST[types[l]]}.tags` : `${l}.tags`
      );
      const reducer = (acc, { name, result }) => {
        if (active.includes(name)) {
          acc[name] = result;
        }
        return acc;
      };

      const filters = get(selectors.filterStages);
      const stats = (Object.keys(filters).length
        ? get(selectors.extendedDatasetStats)
        : get(selectors.datasetStats)
      ).reduce(reducer, {});

      const results = Object.fromEntries(get(allTags).label.map((t) => [t, 0]));
      const selected = get(atoms.selectedSamples);

      if (selected.size) {
        return {
          ...results,
          ...get(selectedSampleLabelStatistics).tags,
        };
      } else {
        active.forEach((field) => {
          for (const tag in stats[field]) {
            results[tag] += stats[field][tag];
          }
        });
      }
      return results;
    } else {
      const selected = get(atoms.selectedSamples);
      const results = Object.fromEntries(
        get(allTags).sample.map((t) => [t, 0])
      );
      if (selected.size) {
        selected.forEach((id) => {
          get(atoms.sample(id)).tags.forEach((t) => {
            results[t] += 1;
          });
        });
      } else {
        const counts = Object.keys(get(selectors.filterStages)).length
          ? get(selectors.filteredTagSampleCounts)
          : get(selectors.tagSampleCounts);
        Object.keys(counts).forEach((t) => {
          results[t] += counts[t];
        });
      }
      return results;
    }
  },
});
