import { Coloring } from "@fiftyone/looker";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import {
  ColorSchemeInput,
  colorSchemeFragment,
  colorSchemeFragment$data,
  colorSchemeFragment$key,
  datasetAppConfigFragment,
  datasetFragment,
  datasetQuery$data,
  graphQLSyncFragmentAtom,
} from "@fiftyone/relay";
import {
  DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  RGB,
  createColorGenerator,
  default_app_color,
  getColor,
  hexToRgb,
  toCamelCase,
} from "@fiftyone/utilities";
import { selector, selectorFamily } from "recoil";
import * as atoms from "./atoms";
import { configData } from "./config";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import { PathEntry, sidebarEntries } from "./sidebar";

export const datasetColorScheme = graphQLSyncFragmentAtom<
  colorSchemeFragment$key,
  colorSchemeFragment$data
>(
  {
    fragments: [datasetFragment, datasetAppConfigFragment, colorSchemeFragment],
    keys: ["dataset", "appConfig", "colorScheme"],
    read: (data) => {
      console.log("dataset colorscheme", data);
      return data;
    },
    default: null,
  },
  {
    key: "datasetColorScheme",
  }
);

export const coloring = selector<Coloring>({
  key: "coloring",
  get: ({ get }) => {
    const colorScheme = get(atoms.colorScheme);
    const seed = get(atoms.colorSeed);

    return {
      seed,
      pool: colorScheme.colorPool,
      scale: get(configData).colorscale as RGB[], // from config, used as fallback
      by: colorScheme.colorBy,
      points: colorScheme.multicolorKeypoints,
      defaultMaskTargets: get(selectors.defaultTargets),
      defaultMaskTargetsColors: colorScheme.defaultMaskTargetsColors,
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
    id: colorScheme.id,
    colorPool:
      colorScheme.colorPool ?? appConfig?.colorPool ?? default_app_color,
    colorBy: colorScheme.colorBy ?? appConfig?.colorBy ?? "field",
    fields: (colorScheme.fields as ColorSchemeInput["fields"]) ?? [],
    colorscales:
      (colorScheme.colorscales as ColorSchemeInput["colorscales"]) ?? [],
    labelTags: (colorScheme.labelTags as ColorSchemeInput["labelTags"]) ?? {
      fieldColor: null,
      valueColors: [],
    },
    defaultMaskTargetsColors: colorScheme.defaultMaskTargetsColors ?? [],
    defaultColorscale: colorScheme.defaultColorscale ?? {
      name: appConfig?.colorscale ?? "viridis",
      list: null,
    },
    multicolorKeypoints:
      typeof colorScheme.multicolorKeypoints == "boolean"
        ? colorScheme.multicolorKeypoints
        : appConfig?.multicolorKeypoints ?? false,
    opacity:
      typeof colorScheme.opacity === "number" ? colorScheme.opacity : 0.7,
    showSkeletons:
      typeof colorScheme.showSkeletons == "boolean"
        ? colorScheme.showSkeletons
        : appConfig?.showSkeletons ?? true,
  };
};
