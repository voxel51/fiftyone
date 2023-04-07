import { DefaultValue, selector, selectorFamily } from "recoil";

import { Coloring } from "@fiftyone/looker";
import {
  createColorGenerator,
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
      const customizeColor = get(customizeColorSettings).find(
        (x) => x.field === path
      );
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

export const guardRecoilDefaultValue = (
  candidate: unknown
): candidate is DefaultValue => {
  if (candidate instanceof DefaultValue) return true;
  return false;
};

export const customizeColorSelector = selectorFamily<
  atoms.CustomizeColor,
  string
>({
  key: "customizeColorSelector",
  get:
    (fieldPath) =>
    ({ get }) =>
      get(atoms.customizeColors(fieldPath)),
  set:
    (fieldPath) =>
    ({ set, reset }, newFieldSetting) => {
      // if newFieldSetting is DefaultValue, the set method will delete the atom from the atomFamily and update customizeColorFields
      if (newFieldSetting instanceof DefaultValue) {
        reset(atoms.customizeColors(fieldPath));
        set(atoms.customizeColorFields, (preValue) =>
          preValue.filter((field) => field !== fieldPath)
        );
      } else {
        // create the atom and update the customizeColorFields list
        set(atoms.customizeColors(fieldPath), newFieldSetting);
        set(atoms.customizeColorFields, (preValue) => [
          ...new Set([...preValue, fieldPath]),
        ]);
      }
    },
});

export const customizeColorSettings = selector<atoms.CustomizeColor[]>({
  key: "customizeColorSettings",
  get: ({ get }) => {
    const fields = get(atoms.customizeColorFields);
    return fields.map((field) => get(customizeColorSelector(field)));
  },
});
