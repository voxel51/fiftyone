import { atom, selectorFamily } from "recoil";

import {
  LABEL_LIST,
  VALID_LIST_TYPES,
  VALID_PRIMITIVE_TYPES,
} from "@fiftyone/utilities";

import { expandPath, fields } from "./schema";
import { State } from "./types";
import { hiddenLabelIds } from "./selectors";
import { Nonfinite } from "./aggregations";

export const modalFilters = atom<State.Filters>({
  key: "modalFilters",
  default: {},
});

export const filters = atom<State.Filters>({
  key: "filters",
  default: {},
});

export const filter = selectorFamily<
  State.Filter,
  { path: string; modal: boolean }
>({
  key: "filter",
  get: ({ path, modal }) => ({ get }) => {
    const f = get(modal ? modalFilters : filters);

    if (f[path]) {
      return f[path];
    }

    return null;
  },
  set: ({ path, modal }) => ({ get, set }, filter) => {
    const atom = modal ? modalFilters : filters;
    const newFilters = Object.assign({}, get(atom));
    if (filter === null) {
      delete newFilters[path];
    } else {
      newFilters[path] = filter;
    }
    set(atom, newFilters);
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const hasFilters = selectorFamily<boolean, boolean>({
  key: "hasFilters",
  get: (modal) => ({ get }) => {
    const f = Object.keys(get(modal ? modalFilters : filters)).length > 0;
    const hidden = Boolean(modal && get(hiddenLabelIds).size);

    return f || hidden;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const matchedTags = selectorFamily<
  Set<string>,
  { key: State.TagKey; modal: boolean }
>({
  key: "matchedTags",
  get: ({ key, modal }) => ({ get }) => {
    const tags = get(modal ? modalFilters : filters).tags;
    if (tags && tags[key]) {
      return new Set(tags[key]);
    }
    return new Set();
  },
  set: ({ key, modal }) => ({ get, set }, value) => {
    const atom = modal ? modalFilters : filters;
    const stages = {
      ...get(atom),
    };
    const tags = { ...(stages.tags || {}) };
    if (value instanceof Set && value.size) {
      tags[key] = Array.from(value);
    } else if (stages.tags && key in stages.tags) {
      delete tags[key];
    }
    stages.tags = tags;
    if (Object.keys(stages.tags).length === 0) {
      delete stages["tags"];
    }
    set(atom, stages);
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal?: boolean }
>({
  key: "fieldIsFiltered",
  get: ({ path, modal }) => ({ get }) => {
    const f = get(modal ? modalFilters : filters);

    const expandedPath = get(expandPath(path));
    const paths = get(
      fields({
        path: expandedPath,
        ftype: VALID_PRIMITIVE_TYPES,
      })
    );

    return (
      Boolean(f[path]) || paths.some(({ name }) => f[`${expandedPath}.${name}`])
    );
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});
