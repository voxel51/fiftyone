import { Coloring } from "@fiftyone/looker";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import {
  DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  RGB,
  createColorGenerator,
  getColor,
  hexToRgb,
} from "@fiftyone/utilities";
import { selector, selectorFamily } from "recoil";
import { DEFAULT_APP_COLOR_SCHEME } from "../utils";
import * as atoms from "./atoms";
import { colorPalette, colorscale } from "./config";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import { PathEntry, sidebarEntries } from "./sidebar";

export const coloring = selectorFamily<Coloring, boolean>({
  key: "coloring",
  get:
    (modal) =>
    ({ get }) => {
      const pool = get(colorPalette) ?? DEFAULT_APP_COLOR_SCHEME.colorPool;
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
      const pool = get(colorPalette) ?? DEFAULT_APP_COLOR_SCHEME.colorPool;
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
      // video path tweak
      const field = get(schemaAtoms.field(path));
      const video = get(selectors.mediaTypeSelector) !== "image";

      const parentPath =
        video && path.startsWith("frames.")
          ? path.split(".").slice(0, 2).join(".")
          : path.split(".")[0];

      let adjustedPath = field?.embeddedDocType
        ? parentPath.startsWith("frames.")
          ? parentPath.slice("frames.".length)
          : parentPath
        : path;

      if (
        get(schemaAtoms.field(adjustedPath))?.embeddedDocType ===
        DYNAMIC_EMBEDDED_DOCUMENT_PATH
      ) {
        adjustedPath = path;
      }

      const setting = get(atoms.sessionColorScheme)?.fields?.find(
        (x) => x.path === adjustedPath
      );

      if (isValidColor(setting?.fieldColor ?? "")) {
        return setting!.fieldColor;
      }

      const map = get(colorMap(modal));

      if (get(schemaAtoms.labelFields({})).includes(parentPath)) {
        return map(parentPath);
      }

      return map(path);
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const eligibleFieldsToCustomizeColor = selector({
  key: "eligibleFieldsToCustomizeColor",
  get: ({ get }) => {
    const entries = get(
      sidebarEntries({ modal: false, loading: false })
    ).filter(
      (e) => e.kind == "PATH" && !["_label_tags", "tags"].includes(e.path)
    ) as PathEntry[];
    const fields = entries.map((e) => get(schemaAtoms.field(e.path)));
    return fields;
  },
});
