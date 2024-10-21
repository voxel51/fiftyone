import { DefaultValue, atomFamily, selectorFamily } from "recoil";

export const sidebarExpandedStore = atomFamily<
  { [key: string]: boolean },
  boolean
>({
  key: "sidebarExpandedStore",
  default: {},
});

export const sidebarExpanded = selectorFamily<
  boolean,
  { path: string; modal: boolean }
>({
  key: "sidebarExpanded",
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
