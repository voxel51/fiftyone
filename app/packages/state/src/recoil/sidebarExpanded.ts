import { subscribe } from "@fiftyone/relay";
import { atom, atomFamily, DefaultValue, selectorFamily } from "recoil";

export const sidebarExpandedStore = atomFamily<
  { [key: string]: boolean },
  boolean
>({
  key: "sidebarExpanded",
  default: {},
  effects: [({ node }) => subscribe((_, { reset }) => reset(node))],
});

export const sidebarExpanded = selectorFamily<
  boolean,
  { path: string; modal: boolean }
>({
  key: "granularSidebarExpanded",
  get:
    (params) =>
    ({ get }) =>
      get(sidebarExpandedStore(params.modal))[params.path] ?? false,
  set:
    (params) =>
    ({ set }, value) =>
      set(sidebarExpandedStore(params.modal), (store) => ({
        ...store,
        [params.path]: value instanceof DefaultValue ? false : value,
      })),
});

export const granularSidebarExpandedStore = atom<{ [key: string]: boolean }>({
  key: "granularSidebarExpandedStore",
  default: {},
  effects: [({ node }) => subscribe((_, { set }) => set(node, {}))],
});

export const granularSidebarExpanded = selectorFamily<boolean, string>({
  key: "granularSidebarExpanded",
  get:
    (path) =>
    ({ get }) =>
      get(granularSidebarExpandedStore)[path] ?? false,
  set:
    (path) =>
    ({ set }, value) =>
      set(granularSidebarExpandedStore, (store) => ({
        ...store,
        [path]: value instanceof DefaultValue ? false : value,
      })),
});
