import { atom, selector, selectorFamily } from "recoil";

import * as atoms from "../../recoil/atoms";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";

export type FilterParams = {
  modal: boolean;
  path: string;
};

export const filterStages = selector<object>({
  key: "filterStages",
  get: ({ get }) => get(atoms.stateDescription).filters,
  set: ({ get, set }, filters) => {
    const state = {
      ...get(atoms.stateDescription),
      filters,
    };
    state.selected.forEach((id) => {
      set(atoms.isSelectedSample(id), false);
    });
    state.selected = [];
    set(atoms.selectedSamples, new Set());
    socket.send(packageMessage("filters_update", { filters }));
    set(atoms.stateDescription, state);
  },
});

export const modalFilterStages = atom<object>({
  key: "modalFilterStages",
  default: filterStages,
});

export const hasFilters = selector<boolean>({
  key: "hasFilters",
  get: ({ get }) => Object.keys(get(filterStages)).length > 0,
});

export const filterStage = selectorFamily<object, FilterParams>({
  key: "filterStage",
  get: ({ path, modal }) => ({ get }) => {
    return get(modal ? modalFilterStages : filterStages)?.[path] ?? {};
  },
  set: ({ path, modal }) => ({ get, set }, filter) => {
    const filters = Object.assign(
      {},
      get(modal ? modalFilterStages : filterStages)
    );
    if (filter === null) {
      delete filters[path];
    } else {
      filters[path] = filter;
    }
    set(filterStages, filters);
  },
});
