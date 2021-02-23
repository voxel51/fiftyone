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

export const activeFields = atomFamily<string[], boolean>({
  key: "activeFields",
  default: selectors.labelPaths,
});

export const activeLabels = selectorFamily<
  string[],
  { modal: boolean; frames: boolean }
>({
  key: "activeLabels",
  get: ({ modal, frames }) => ({ get }) => {
    const paths = get(selectors.labelPaths);
    return get(activeFields(modal))
      .filter((v) => paths.includes(v))
      .filter((v) =>
        frames ? v.startsWith("frames.") : !v.startsWith("frames.")
      );
  },
});

export const activeTags = selectorFamily<string[], boolean>({
  key: "activeTags",
  get: (modal) => ({ get }) => {
    const tags = get(selectors.tagNames);
    return get(activeFields(modal))
      .filter((t) => t.startsWith("tags.") && tags.includes(t.slice(5)))
      .map((t) => t.slice(5));
  },
  set: (modal) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const tags = value.map((v) => "tags." + v);
      let active = get(activeFields(modal)).filter((v) =>
        v.startsWith("tags.") ? tags.includes(v) : true
      );
      if (tags.length) {
        active = [tags[0], ...active.filter((v) => v !== tags[0])];
      }
      set(activeFields(modal), active);
    }
  },
});
