import React, { useState } from "react";
import { useSpring } from "react-spring";
import { selectorFamily } from "recoil";
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
