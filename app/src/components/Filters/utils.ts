import { useState } from "react";
import { useSpring } from "react-spring";
import { atomFamily, selector, selectorFamily } from "recoil";
import useMeasure from "react-use-measure";

import * as selectors from "../../recoil/selectors";
import {
  BOOLEAN_FIELD,
  RESERVED_FIELDS,
  STRING_FIELD,
  VALID_LIST_TYPES,
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

export const unsupportedFields = selector<string[]>({
  key: "unsupportedFields",
  get: ({ get }) => {
    const fields = get(selectors.fieldPaths);
    return fields.filter(
      (f) =>
        !f.startsWith("frames.") &&
        !get(isLabelField(f)) &&
        !get(isNumericField(f)) &&
        !get(isStringField(f)) &&
        !get(isBooleanField(f)) &&
        !["filepath", "metadata", "tags"].includes(f)
    );
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
  set: ({ modal, frames }) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const prevActiveLabels = get(activeLabels({ modal, frames }));

      let active = get(activeFields(modal)).filter((v) =>
        get(isLabelField(v)) ? value.includes(v) : true
      );
      if (value.length && prevActiveLabels.length < value.length) {
        active = [value[0], ...active.filter((v) => v !== value[0])];
      }
      set(activeFields(modal), active);
    }
  },
});

export const activeLabelPaths = selectorFamily<string[], boolean>({
  key: "activeLabelPaths",
  get: (modal) => ({ get }) => {
    const sample = get(activeLabels({ modal, frames: false }));
    const frames = get(activeLabels({ modal, frames: true }));

    return [...sample, ...frames];
  },
});

export const activeScalars = selectorFamily<string[], boolean>({
  key: "activeScalars",
  get: (modal) => ({ get }) => {
    const scalars = get(selectors.scalarNames("sample"));
    return get(activeFields(modal)).filter((v) => scalars.includes(v));
  },
  set: (modal) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const scalars = get(selectors.scalarNames("sample"));
      const prevActiveScalars = get(activeScalars(modal));
      let active = get(activeFields(modal)).filter((v) =>
        scalars.includes(v) ? value.includes(v) : true
      );
      if (value.length && prevActiveScalars.length < value.length) {
        active = [value[0], ...active.filter((v) => v !== value[0])];
      }
      set(activeFields(modal), active);
    }
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
      const prevActiveTags = get(activeTags(modal));
      let active = get(activeFields(modal)).filter((v) =>
        v.startsWith("tags.") ? tags.includes(v) : true
      );
      if (tags.length && prevActiveTags.length < tags.length) {
        active = [tags[0], ...active.filter((v) => v !== tags[0])];
      }
      set(activeFields(modal), active);
    }
  },
});

export const activeLabelTags = selectorFamily<string[], boolean>({
  key: "activeLabelTags",
  get: (modal) => ({ get }) => {
    const tags = get(selectors.labelTagNames);
    return get(activeFields(modal))
      .filter(
        (t) =>
          t.startsWith("_label_tags.") &&
          tags.includes(t.slice("_label_tags.".length))
      )
      .map((t) => t.slice("_label_tags.".length));
  },
  set: (modal) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const tags = value.map((v) => "_label_tags." + v);
      const prevActiveTags = get(activeLabelTags(modal));
      let active = get(activeFields(modal)).filter((v) =>
        v.startsWith("_label_tags.") ? tags.includes(v) : true
      );
      if (tags.length && prevActiveTags.length < tags.length) {
        active = [tags[0], ...active.filter((v) => v !== tags[0])];
      }
      set(activeFields(modal), active);
    }
  },
});
