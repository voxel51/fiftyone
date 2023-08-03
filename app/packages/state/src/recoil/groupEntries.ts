import * as fos from "@fiftyone/state";
import { selectorFamily } from "recoil";

export const groupLength = selectorFamily<
  number,
  { modal: boolean; group: string }
>({
  key: "groupLength",
  get:
    (params) =>
    ({ get }) =>
      get(fos.sidebarGroup({ ...params, loading: true })).length,
});

export const numGroupFieldsFiltered = selectorFamily<
  number,
  { modal: boolean; group: string }
>({
  key: "numGroupFieldsFiltered",
  get:
    (params) =>
    ({ get }) => {
      let count = 0;

      let f = null;

      if (params.modal) {
        const labels = get(fos.labelPaths({ expanded: false }));
        f = (path) => labels.includes(path);
      }

      for (const path of get(fos.sidebarGroup({ ...params, loading: true }))) {
        if (
          get(fos.fieldIsFiltered({ path, modal: params.modal })) &&
          (!f || f(path))
        )
          count++;
      }

      return count;
    },
});

export const numGroupFieldsVisible = selectorFamily<
  number,
  { modal: boolean; group: string }
>({
  key: "numGroupFieldsVisible",
  get:
    (params) =>
    ({ get }) => {
      let count = 0;

      let f = null;

      if (params.modal) {
        const labels = get(fos.labelPaths({ expanded: false }));
        f = (path) => labels.includes(path);
      }

      for (const path of get(fos.sidebarGroup({ ...params, loading: true }))) {
        if (
          get(fos.fieldHasVisibilitySetting({ path, modal: params.modal })) &&
          (!f || f(path))
        )
          count++;
      }

      return count;
    },
});

export const numGroupFieldsActive = selectorFamily<
  number,
  { modal: boolean; group: string }
>({
  key: "numGroupFieldsActive",
  get:
    (params) =>
    ({ get }) => {
      let active = get(fos.activeFields({ modal: params.modal }));

      let f = null;

      if (params.modal) {
        const labels = get(fos.labelPaths({ expanded: false }));
        f = (path) => labels.includes(path);
        active = active.filter((p) => f(p));
      }

      f = get(fos.textFilter(params.modal));

      if (params.group === "tags") {
        return active.filter(
          (p) => p.startsWith("tags.") && p.slice("tags.".length).includes(f)
        ).length;
      }

      if (params.group === "tags") {
        return active.filter(
          (p) =>
            p.startsWith("_label_tags.") &&
            p.slice("_label_tags.".length).includes(f)
        ).length;
      }

      const paths = new Set(
        get(fos.sidebarGroup({ ...params, loading: true }))
      );

      return active.filter((p) => p.includes(f) && paths.has(p)).length;
    },
});

export const replace = {};
