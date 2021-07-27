import { useState } from "react";
import { selector, selectorFamily } from "recoil";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import { activeLabelPaths } from "../Filters/utils";
import * as filterAtoms from "../Filters/atoms";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { useTheme } from "../../utils/hooks";
import { packageMessage, request } from "../../utils/socket";
import socket from "../../shared/connection";

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
      return 0;
    } else if (modal) {
      return 1;
    } else {
      return 0;
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
        sample_id: modal ? get(atoms.modal).sampleId : null,
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
  { [key: string]: number },
  { modal: boolean; labels: boolean }
>({
  key: "tagStats",
  get: ({ modal, labels }) => ({ get }) => {
    const results = Object.fromEntries(
      get(allTags)[labels ? "label" : "sample"].map((t) => [t, 0])
    );

    return {
      ...results,
      ...get(tagStatistics({ modal, labels })).tags,
    };
  },
});
