import { useState } from "react";
import { useSpring } from "react-spring";
import { atom, atomFamily, selectorFamily } from "recoil";
import useMeasure from "react-use-measure";

import * as selectors from "../../recoil/selectors";
import {
  BOOLEAN_FIELD,
  STRING_FIELD,
  VALID_NUMERIC_TYPES,
} from "../../utils/labels";

export const isBooleanField = selectorFamily<boolean, string>({
  key: "isBooleanField",
  get: (name) => ({ get }) => {
    const map = get(selectors.scalarsMap("sample"));
    return map[name] === BOOLEAN_FIELD;
  },
});

export const isLabelField = selectorFamily<boolean, string>({
  key: "isLabelField",
  get: (field) => ({ get }) => {
    const names = get(selectors.labelNames("sample")).concat(
      get(selectors.labelNames("frame")).map((l) => "frames." + l)
    );
    return names.includes(field);
  },
});

export const isNumericField = selectorFamily<boolean, string>({
  key: "isNumericField",
  get: (name) => ({ get }) => {
    const map = get(selectors.scalarsMap("sample"));
    return VALID_NUMERIC_TYPES.includes(map[name]);
  },
});

export const isStringField = selectorFamily<boolean, string>({
  key: "isStringField",
  get: (name) => ({ get }) => {
    const map = get(selectors.scalarsMap("sample"));
    return map[name] === STRING_FIELD;
  },
});

export const hasNoneField = selectorFamily<boolean, string>({
  key: "hasNoneField",
  get: (path) => ({ get }) => {
    return get(selectors.noneFieldCounts)[path] > 0;
  },
});

type Overflow = "hidden" | "visible";

type ExpandStyle = {
  overflow: Overflow;
  height: number;
};

export const useExpand = (
  expanded: boolean
): [(element: HTMLElement | null) => void, ExpandStyle] => {
  const [overflow, setOverflow] = useState<Overflow>("hidden");

  const [ref, { height }] = useMeasure();
  const props = useSpring({
    height: expanded ? height : 0,
    from: {
      height: 0,
    },
    onStart: () => !expanded && setOverflow("hidden"),
    onRest: () => expanded && setOverflow("visible"),
  });
  return [
    ref,
    {
      overflow,
      ...props,
    },
  ];
};

export const activeLabels = atomFamily<string[], string>({
  key: "activeLabels",
  default: selectors.labelNames,
});

export const activeLabelPaths = selectorFamily<string[], boolean>({
  key: "activeLabelPaths",
  get: (modal) => ({ get }) => {
    const node = modal ? modalActiveLabels : activeLabels;
    return [
      ...get(node("sample")),
      ...get(node("frames")).map((l) => "frames." + l),
    ];
  },
});

export const modalActiveLabels = atomFamily<string[], string>({
  key: "modalActiveLabels",
  default: activeLabels,
});

export const activeTags = atom<string[]>({
  key: "activeTags",
  default: [],
});

export const modalActiveTags = atom<string[]>({
  key: "modalActiveTags",
  default: [],
});
