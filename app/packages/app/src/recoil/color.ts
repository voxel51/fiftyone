import { selectorFamily } from "recoil";

import { Coloring, createColorGenerator } from "@fiftyone/looker";
import { getColor } from "@fiftyone/looker/src/color";

import { darkTheme } from "../shared/colors";
import * as atoms from "./atoms";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";

export const coloring = selectorFamily<Coloring, boolean>({
  key: "coloring",
  get: (modal) => ({ get }) => {
    const pool = get(atoms.colorPool);
    const seed = get(atoms.colorSeed(modal));
    return {
      seed,
      pool,
      scale: get(atoms.stateDescription).colorscale,
      byLabel: get(atoms.colorByLabel(modal)),
      defaultMaskTargets: get(selectors.defaultTargets),
      maskTargets: get(selectors.targets).fields,
      targets: new Array(pool.length)
        .fill(0)
        .map((_, i) => getColor(pool, seed, i)),
    };
  },
});

export const colorMap = selectorFamily<(val) => string, boolean>({
  key: "colorMap",
  get: (modal) => ({ get }) => {
    const colorByLabel = get(atoms.colorByLabel(modal));
    let pool = get(atoms.colorPool);
    pool = pool.length ? pool : [darkTheme.brand];
    const seed = get(atoms.colorSeed(modal));

    return createColorGenerator(pool, seed);
  },
});

export const pathColor = selectorFamily<
  string,
  { path: string; modal: boolean }
>({
  key: "pathColor",
  get: ({ modal, path }) => ({ get }) => {
    const map = get(colorMap(modal));
    const video = get(selectors.isVideoDataset);

    const parentPath =
      video && path.startsWith("frames.")
        ? path.split(".").slice(0, 2).join(".")
        : path.split(".")[0];

    if (get(schemaAtoms.labelFields({})).includes(parentPath)) {
      return map(parentPath);
    }

    return map(path);
  },
});
