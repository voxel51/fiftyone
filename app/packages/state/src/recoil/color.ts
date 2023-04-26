import { DefaultValue, selector, selectorFamily } from "recoil";

import { Coloring } from "@fiftyone/looker";
import {
  createColorGenerator,
  Field,
  getColor,
  hexToRgb,
  RGB,
} from "@fiftyone/utilities";

import * as atoms from "./atoms";
import { colorPalette, colorscale } from "./config";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";

export const coloring = selectorFamily<Coloring, boolean>({
  key: "coloring",
  get:
    (modal) =>
    ({ get }) => {
      const pool = get(colorPalette);
      const seed = get(atoms.colorSeed(modal));
      return {
        seed,
        pool,
        scale: get(colorscale),
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
      let pool = get(colorPalette);
      pool = pool.length ? pool : ["#000000"];
      const seed = get(atoms.colorSeed(modal));
      return createColorGenerator(pool, seed);
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const colorMapRGB = selectorFamily<(val) => RGB, boolean>({
  key: "colorMapRGB",
  get:
    (modal) =>
    ({ get }) => {
      const hex = get(colorMap(modal));
      return (val) => hexToRgb(hex(val));
    },
});

export const pathColor = selectorFamily<
  string,
  { path: string; modal: boolean }
>({
  key: "pathColor",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      // if path exists in customizeColorFields, return the color
      const customizeColor = get(
        atoms.sessionColorScheme
      )?.customizedColorSettings?.find((x) => x.field === path);
      if (isValidColor(customizeColor?.fieldColor)) {
        return customizeColor.fieldColor;
      }

      const map = get(colorMap(modal));
      const video = get(selectors.mediaTypeSelector) !== "image";

      const parentPath =
        video && path.startsWith("frames.")
          ? path.split(".").slice(0, 2).join(".")
          : path.split(".")[0];

      if (get(schemaAtoms.labelFields({})).includes(parentPath)) {
        return map(parentPath);
      }

      return map(path);
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});
