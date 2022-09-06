import { selectorFamily } from "recoil";

import { Coloring, createColorGenerator } from "@fiftyone/looker";
import { getColor } from "@fiftyone/utilities";

import * as atoms from "./atoms";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import { State } from "./types";
import { darkTheme } from "@fiftyone/utilities";

export const coloring = selectorFamily<Coloring, boolean>({
  key: "coloring",
  get:
    (modal) =>
    ({ get }) => {
      const pool = get(atoms.colorPool);
      const seed = get(atoms.colorSeed(modal));
      return {
        seed,
        pool,
        scale: get(atoms.colorscale),
        by: get(selectors.appConfigOption({ key: "colorBy", modal })),
        points: get(
          selectors.appConfigOption({ key: "multicolorKeypoints", modal })
        ) as boolean,
        defaultMaskTargets: get(selectors.defaultTargets),
        maskTargets: get(selectors.targets).fields,
        targets: new Array(pool.length)
          .fill(0)
          .map((_, i) => getColor(pool, seed, i)),
      };
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const colorMap = selectorFamily<(val) => string, boolean>({
  key: "colorMap",
  get:
    (modal) =>
    ({ get }) => {
      get(selectors.appConfigOption({ key: "colorBy", modal }));
      let pool = get(atoms.colorPool);
      pool = pool.length ? pool : [darkTheme.brand];
      const seed = get(atoms.colorSeed(modal));

      return createColorGenerator(pool, seed);
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const pathColor = selectorFamily<
  string,
  { path: string; modal: boolean; tag?: State.TagKey }
>({
  key: "pathColor",
  get:
    ({ modal, path, tag }) =>
    ({ get }) => {
      const map = get(colorMap(modal));
      const video = get(selectors.isVideoDataset);

      const parentPath =
        video && path.startsWith("frames.")
          ? path.split(".").slice(0, 2).join(".")
          : path.split(".")[0];

      if (tag) {
        return map(
          tag === State.TagKey.SAMPLE ? `tags.${path}` : `_label_tags.${path}`
        );
      }

      if (get(schemaAtoms.labelFields({})).includes(parentPath)) {
        return map(parentPath);
      }

      return map(path);
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});
