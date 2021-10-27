import { atom, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { AGGS, LABEL_LIST, LABEL_LISTS } from "../../utils/labels";
import { request } from "../../utils/socket";
import { viewsAreEqual } from "../../utils/view";

export { filterStages } from "../../recoil/selectors";

export type FilterParams = {
  modal: boolean;
  path: string;
};

export const modalFilterStages = atom<object>({
  key: "modalFilterStages",
  default: {},
});

export const hasFilters = selectorFamily<boolean, boolean>({
  key: "hasFilters",
  get: (modal) => ({ get }) =>
    Object.keys(get(modal ? modalFilterStages : selectors.filterStages))
      .length > 0,
});

export const matchedTags = selectorFamily<
  Set<string>,
  { key: string; modal: boolean }
>({
  key: "matchedTags",
  get: ({ key, modal }) => ({ get }) => {
    const tags = get(modal ? modalFilterStages : selectors.filterStages).tags;
    if (tags && tags[key]) {
      return new Set(tags[key]);
    }
    return new Set();
  },
  set: ({ key, modal }) => ({ get, set }, value) => {
    const stages = {
      ...get(modal ? modalFilterStages : selectors.filterStages),
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
    set(modal ? modalFilterStages : selectors.filterStages, stages);
  },
});

export const filterStage = selectorFamily<object, FilterParams>({
  key: "filterStage",
  get: ({ path, modal }) => ({ get }) => {
    return (
      get(modal ? modalFilterStages : selectors.filterStages)?.[path] ?? {}
    );
  },
  set: ({ path, modal }) => ({ get, set }, filter) => {
    const filters = Object.assign(
      {},
      get(modal ? modalFilterStages : selectors.filterStages)
    );
    if (filter === null) {
      delete filters[path];
    } else {
      filters[path] = filter;
    }
    set(modal ? modalFilterStages : selectors.filterStages, filters);
  },
});
