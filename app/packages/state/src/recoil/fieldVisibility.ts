import { atom, selectorFamily } from "recoil";

import { VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";

import { expandPath, fields } from "./schema";
import { State } from "./types";
import { hiddenLabelIds } from "./selectors";

export const modalFieldVisibility = atom<State.Filters>({
  key: "modalFieldVisibility",
  default: {},
});

export const fieldVisibility = atom<State.Filters>({
  key: "fieldVisibility",
  default: {},
});

export const visibility = selectorFamily<
  State.Filters,
  { path: string; modal: boolean }
>({
  key: "visibility",
  get:
    ({ path, modal }) =>
    ({ get }) => {
      const f = get(modal ? modalFieldVisibility : fieldVisibility);

      if (f[path]) {
        return f[path];
      }

      return null;
    },
  set:
    ({ path, modal }) =>
    ({ get, set }, visibility) => {
      const atom = modal ? modalFieldVisibility : fieldVisibility;
      const newSetting = Object.assign({}, get(atom));
      if (visibility === null) {
        delete newSetting[path];
      } else {
        newSetting[path] = visibility;
      }
      set(atom, newSetting);
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const hasVisibility = selectorFamily<boolean, boolean>({
  key: "hasVisibility",
  get:
    (modal) =>
    ({ get }) => {
      const f =
        Object.keys(get(modal ? modalFieldVisibility : fieldVisibility))
          .length > 0;
      const hidden = Boolean(modal && get(hiddenLabelIds).size);

      return f || hidden;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const fieldHasVisibilitySetting = selectorFamily<
  boolean,
  { path: string; modal?: boolean }
>({
  key: "fieldHasVisibilitySetting",
  get:
    ({ path, modal }) =>
    ({ get }) => {
      const f = get(modal ? modalFieldVisibility : fieldVisibility);

      const expandedPath = get(expandPath(path));
      const paths = get(
        fields({
          path: expandedPath,
          ftype: VALID_PRIMITIVE_TYPES,
        })
      );

      return (
        Boolean(f[path]) ||
        paths.some(({ name }) => f[`${expandedPath}.${name}`])
      );
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});
