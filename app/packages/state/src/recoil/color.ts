import { Coloring } from "@fiftyone/looker";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { ColorSchemeInput, datasetQuery$data } from "@fiftyone/relay";
import {
  DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  RGB,
  createColorGenerator,
  getColor,
  hexToRgb,
  toCamelCase,
} from "@fiftyone/utilities";
import { selector, selectorFamily } from "recoil";
import * as atoms from "./atoms";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import { PathEntry, sidebarEntries } from "./sidebar";

export const coloring = selector<Coloring>({
  key: "coloring",
  get: ({ get }) => {
    const colorScheme = get(atoms.colorScheme);
    const seed = get(atoms.colorSeed);
    const defaultMaskTargetsWithColors = combineTargetsAndColors(
      get(selectors.defaultTargets),
      colorScheme.defaultMaskTargetsColors
    );

    return {
      seed,
      pool: colorScheme.colorPool,
      scale: [],
      by: colorScheme.colorBy,
      points: colorScheme.multicolorKeypoints,
      defaultMaskTargets: defaultMaskTargetsWithColors,
      maskTargets: get(selectors.targets).fields,
      targets: new Array(colorScheme.colorPool.length)
        .fill(0)
        .map((_, i) => getColor(colorScheme.colorPool, seed, i)),
    };
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const colorMap = selector<(val) => string>({
  key: "colorMap",
  get: ({ get }) => {
    const pool = get(atoms.colorScheme).colorPool;
    const seed = get(atoms.colorSeed);
    return createColorGenerator(pool, seed);
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const colorMapRGB = selector<(val) => RGB>({
  key: "colorMapRGB",
  get: ({ get }) => {
    const hex = get(colorMap);
    return (val) => hexToRgb(hex(val));
  },
});

export const pathColor = selectorFamily<string, string>({
  key: "pathColor",
  get:
    (path) =>
    ({ get }) => {
      // video path tweak
      const field = get(schemaAtoms.field(path));
      const video = get(atoms.mediaType) !== "image";

      const parentPath =
        video && path.startsWith("frames.")
          ? path.split(".").slice(0, 2).join(".")
          : path.split(".")[0];

      let adjustedPath = field?.embeddedDocType ? parentPath : path;

      if (
        get(schemaAtoms.field(adjustedPath))?.embeddedDocType ===
        DYNAMIC_EMBEDDED_DOCUMENT_PATH
      ) {
        adjustedPath = path;
      }

      const setting =
        path === "_label_tags"
          ? get(atoms.colorScheme).labelTags
          : get(atoms.colorScheme)?.fields?.find(
              (x) => x.path === adjustedPath
            );

      if (isValidColor(setting?.fieldColor ?? "")) {
        return setting!.fieldColor;
      }

      const map = get(colorMap);

      if (get(schemaAtoms.labelFields({})).includes(parentPath)) {
        return map(parentPath);
      }

      return map(path);
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

export const ensureColorScheme = (
  colorScheme: any,
  appConfig?: datasetQuery$data["config"]
): ColorSchemeInput => {
  colorScheme = toCamelCase(colorScheme);
  return {
    colorPool: colorScheme.colorPool ?? appConfig?.colorPool,
    colorBy: colorScheme.colorBy ?? appConfig?.colorBy,
    fields: (colorScheme.fields as ColorSchemeInput["fields"]) ?? [],
    labelTags: (colorScheme.labelTags as ColorSchemeInput["labelTags"]) ?? {},
    defaultMaskTargetsColors: colorScheme.defaultMaskTargetsColors ?? [],
    multicolorKeypoints:
      typeof colorScheme.multicolorKeypoints == "boolean"
        ? colorScheme.multicolorKeypoints
        : appConfig?.multicolorKeypoints,
    opacity:
      typeof colorScheme.opacity === "number" ? colorScheme.opacity : 0.7,
    showSkeletons:
      typeof colorScheme.showSkeletons == "boolean"
        ? colorScheme.showSkeletons
        : appConfig?.showSkeletons,
  };
};

const combineTargetsAndColors = (targets, colors) => {
  let is2D = typeof Number(Object.keys(targets)[0]) === "number";

  // if 2D mask type, apply applicable colors based on index value
  if (is2D) {
    Object.entries(targets).forEach(([key, _]) => {
      targets[key]["color"] = colors[Number(key)];
    });
  }
  return targets;
};
