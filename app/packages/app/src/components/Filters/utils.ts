import { atom, selector, selectorFamily } from "recoil";

import * as selectors from "../../recoil/selectors";
import { isLabelField } from "./LabelFieldFilters.state";
import { isBooleanField } from "./BooleanFieldFilter.state";
import { isNumericField } from "./NumericFieldFilter.state";
import { isStringField } from "./StringFieldFilter.state";

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
        !["metadata", "tags"].includes(f) &&
        !get(selectors.primitiveNames("sample")).includes(f)
    );
  },
});

export const activeFields = atom<string[]>({
  key: "activeFields",
  default: selectors.labelPaths,
});

export const activeModalFields = atom<string[]>({
  key: "activeModalFields",
  default: [],
});

export const activeLabels = selectorFamily<
  string[],
  { modal: boolean; frames: boolean }
>({
  key: "activeLabels",
  get: ({ modal, frames }) => ({ get }) => {
    const paths = get(selectors.labelPaths);
    return get(modal ? activeModalFields : activeFields)
      .filter((v) => paths.includes(v))
      .filter((v) =>
        frames ? v.startsWith("frames.") : !v.startsWith("frames.")
      );
  },
  set: ({ modal, frames }) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      let active = get(modal ? activeModalFields : activeFields).filter((v) =>
        get(isLabelField(v)) &&
        (frames ? v.startsWith("frames.") : !v.startsWith("frames."))
          ? value.includes(v)
          : true
      );

      if (value.length) {
        active = [value[0], ...active.filter((v) => v !== value[0])];
      }
      set(modal ? activeModalFields : activeFields, active);
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
    const scalars = get(selectors.primitiveNames("sample"));
    return get(modal ? activeModalFields : activeFields).filter((v) =>
      scalars.includes(v)
    );
  },
  set: (modal) => ({ get, set }, value) => {
    if (modal) {
      return [];
    }
    if (Array.isArray(value)) {
      const scalars = get(selectors.primitiveNames("sample"));
      const prevActiveScalars = get(activeScalars(modal));
      let active = get(modal ? activeModalFields : activeFields).filter((v) =>
        scalars.includes(v) ? value.includes(v) : true
      );
      if (value.length && prevActiveScalars.length < value.length) {
        active = [value[0], ...active.filter((v) => v !== value[0])];
      }
      set(modal ? activeModalFields : activeFields, active);
    }
  },
});

export const activeTags = selectorFamily<string[], boolean>({
  key: "activeTags",
  get: (modal) => ({ get }) => {
    return get(modal ? activeModalFields : activeFields)
      .filter((t) => t.startsWith("tags."))
      .map((t) => t.slice(5));
  },
  set: (modal) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const tags = value.map((v) => "tags." + v);
      const prevActiveTags = get(activeTags(modal));
      let active = get(modal ? activeModalFields : activeFields).filter((v) =>
        v.startsWith("tags.") ? tags.includes(v) : true
      );
      if (tags.length && prevActiveTags.length < tags.length) {
        active = [tags[0], ...active.filter((v) => v !== tags[0])];
      }
      set(modal ? activeModalFields : activeFields, active);
    }
  },
});

export const activeLabelTags = selectorFamily<string[], boolean>({
  key: "activeLabelTags",
  get: (modal) => ({ get }) => {
    return get(modal ? activeModalFields : activeFields)
      .filter((t) => t.startsWith("_label_tags."))
      .map((t) => t.slice("_label_tags.".length));
  },
  set: (modal) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const tags = value.map((v) => "_label_tags." + v);
      const prevActiveTags = get(activeLabelTags(modal));
      let active = get(modal ? activeModalFields : activeFields).filter((v) =>
        v.startsWith("_label_tags.") ? tags.includes(v) : true
      );
      if (tags.length && prevActiveTags.length < tags.length) {
        active = [tags[0], ...active.filter((v) => v !== tags[0])];
      }
      set(modal ? activeModalFields : activeFields, active);
    }
  },
});

const NONSTRING_VALUES: any[] = [false, true, null];
const STRING_VALUES = ["False", "True", "None"];

export const getValueString = (value): [string, boolean] => {
  if (NONSTRING_VALUES.includes(value)) {
    return [STRING_VALUES[NONSTRING_VALUES.indexOf(value)], true];
  }

  if (typeof value === "number") {
    return [value.toLocaleString(), true];
  }

  if (typeof value === "string" && !value.length) {
    return [`""`, true];
  }

  if (Array.isArray(value)) {
    return [`[${value.map((v) => getValueString(v)[0]).join(", ")}]`, false];
  }

  return [value as string, false];
};
