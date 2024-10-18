import { subscribe } from "@fiftyone/relay";
import { DefaultValue, atomFamily, selectorFamily } from "recoil";

export const sidebarExpandedStore = atomFamily<
  { [key: string]: boolean },
  boolean
>({
  key: "sidebarExpandedStore",
  default: {},
  effects: [
    ({ node }) =>
      subscribe(({ event }, { reset }, previous) => {
        event !== "modal" && previous?.event !== "modal" && reset(node);
      }),
  ],
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
