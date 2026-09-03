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
  COLOR_BY,
  DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  RGB,
  createColorGenerator,
  default_app_color,
  getColor,
  hexToRgb,
  toCamelCase,
} from "@fiftyone/utilities";
import { useCallback } from "react";
import { selector, selectorFamily, useRecoilValue } from "recoil";
import * as atoms from "./atoms";
import { configData } from "./config";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import { PathEntry, sidebarEntries } from "./sidebar";
import { cloneDeep } from "lodash";

export const datasetColorScheme = graphQLSyncFragmentAtom<
  colorSchemeFragment$key,
  colorSchemeFragment$data
>(
  {
    fragments: [datasetFragment, datasetAppConfigFragment, colorSchemeFragment],
    keys: ["dataset", "appConfig", "colorScheme"],
    default: null,
  },
  {
    key: "datasetColorScheme",
  },
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

/**
 * Resolver for temporal-tag colors. Temporal tags are ALWAYS colored by value
 * (the tag name), independent of the global color-by mode: each name maps to
 * its configured color, falling back to the seeded hashed pool. Shared by the
 * grid overlay, the timeline tracks, and the filter dots so a tag looks the
 * same everywhere.
 */
export const temporalTagColor = selector<(value: string) => string>({
  key: "temporalTagColor",
  get: ({ get }) => {
    const setting = get(atoms.colorScheme).temporalTags ?? {};
    const map = get(colorMap);
    const byValue = new Map(
      (setting.valueColors ?? []).map((v) => [v.value, v.color]),
    );
    return (value: string) => byValue.get(value) ?? map(value);
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

/**
 * Domain hook for the {@link temporalTagColor} resolver: returns a
 * `(value: string) => string` mapping each temporal-tag name to its color.
 * Consume this from components/hooks instead of reading the selector directly.
 */
export const useTemporalTagColor = () => useRecoilValue(temporalTagColor);

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
              (x) => x.path === adjustedPath,
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

/**
 * How a sidebar filter path's values are colored when coloring by value: the
 * per-value colors that apply to it, and whether value coloring reaches the
 * path at all.
 *
 * The color scheme stores value colors under the *label field*
 * (`ground_truth`), not under the filter path the sidebar row sits at
 * (`ground_truth.detections.label`), and the looker paints them only for the
 * one attribute that field is colored by — `colorByAttribute`, defaulting to
 * `label`. A row for any other attribute is not what the overlays key on, so
 * it takes the field color rather than a hash of its own values; looking the
 * setting up under the filter path instead would miss every configured color
 * and hash all of them.
 *
 * A path outside any label field owns its own entry, and every value on it
 * applies.
 */
const valueColoring = selectorFamily<
  { readonly applies: boolean; readonly configured: Map<string, string> },
  string
>({
  key: "valueColoring",
  get:
    (path) =>
    ({ get }) => {
      const scheme = get(atoms.colorScheme);
      const configured = (setting?: {
        valueColors?: readonly { value: string; color: string }[] | null;
      }) =>
        new Map((setting?.valueColors ?? []).map((v) => [v.value, v.color]));

      if (path === "_label_tags") {
        return { applies: true, configured: configured(scheme.labelTags) };
      }

      // Same derivation as `pathColor`: a label field owns every path beneath
      // it, and under video the frames prefix is part of the field's name.
      const video = get(atoms.mediaType) !== "image";
      const parentPath =
        video && path.startsWith("frames.")
          ? path.split(".").slice(0, 2).join(".")
          : path.split(".")[0];

      if (!get(schemaAtoms.labelFields({})).includes(parentPath)) {
        return {
          applies: true,
          configured: configured(scheme.fields?.find((x) => x.path === path)),
        };
      }

      const setting = scheme.fields?.find((x) => x.path === parentPath);
      const attribute = path
        .slice(parentPath.length + 1)
        .split(".")
        .pop();

      if ((setting?.colorByAttribute || "label") !== attribute) {
        return { applies: false, configured: new Map<string, string>() };
      }

      return { applies: true, configured: configured(setting) };
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

/**
 * Resolver for the values of one path, under whichever color-by mode is set:
 * the path's own field color when coloring by field, and the value's own color
 * when coloring by value, honoring any per-value colors configured for the
 * field.
 *
 * This is what the sidebar paints a filter value's dot with, so anything else
 * that shows the same value — a grid overlay's interval marks, a timeline row —
 * matches the sidebar by resolving through here rather than reaching for
 * {@link pathColor} directly. Coloring by instance has no meaning for a
 * primitive value and resolves as coloring by field does.
 */
export const valueColor = selectorFamily<
  (value: string | null) => string,
  string
>({
  key: "valueColor",
  get:
    (path) =>
    ({ get }) => {
      const scheme = get(atoms.colorScheme);
      const field = get(pathColor(path));

      if (scheme.colorBy !== COLOR_BY.VALUE) {
        return () => field;
      }

      const { applies, configured } = get(valueColoring(path));

      if (!applies) {
        return () => field;
      }

      const map = get(colorMap);

      // A null value is the "no value" row, which names nothing to color by.
      return (value) =>
        value === null ? field : (configured.get(value) ?? map(value));
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

/**
 * Domain hook for {@link valueColor}: returns a `(value) => color` for `path`.
 */
export const useValueColor = (path: string) => useRecoilValue(valueColor(path));

/**
 * {@link valueColor} resolvers for a set of paths, resolved together.
 *
 * Takes the paths up front rather than returning a `(path) => color` closure
 * the way {@link temporalTagColor} does: {@link valueColor} reads schema and
 * color-scheme state per path through Recoil, which cannot be evaluated lazily
 * inside a plain function.
 */
const pathValueColors = selectorFamily<
  Record<string, (value: string | null) => string>,
  readonly string[]
>({
  key: "pathValueColors",
  get:
    (paths) =>
    ({ get }) =>
      Object.fromEntries(paths.map((path) => [path, get(valueColor(path))])),
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

/**
 * Domain hook for {@link pathValueColors}: returns a
 * `(path: string, value?: string) => string` resolving any of `paths` — and,
 * where the caller names one of that path's values, that value — to the color
 * the sidebar shows for it.
 *
 * Omit `value` for something the sidebar has no value dot for: those take the
 * field's color in both modes. A path that was not requested falls back to the
 * seeded pool, so a caller that discovers a path late still gets a stable
 * color rather than nothing.
 */
export const usePathValueColors = (
  paths: readonly string[],
): ((path: string, value?: string) => string) => {
  const colors = useRecoilValue(pathValueColors(paths));
  const map = useRecoilValue(colorMap);
  return useCallback(
    (path: string, value?: string) =>
      colors[path]?.(value ?? null) ?? map(path),
    [colors, map],
  );
};

export const eligibleFieldsToCustomizeColor = selector({
  key: "eligibleFieldsToCustomizeColor",
  get: ({ get }) => {
    const entries = get(
      sidebarEntries({ modal: false, loading: false }),
    ).filter(
      (e) => e.kind == "PATH" && !["_label_tags", "tags"].includes(e.path),
    ) as PathEntry[];
    const fields = entries.map((e) => get(schemaAtoms.field(e.path)));
    return fields;
  },
});

export const ensureColorScheme = (
  colorScheme: any,
  appConfig?: datasetQuery$data["config"],
): ColorSchemeInput => {
  colorScheme = toCamelCase(colorScheme);
  return {
    id: colorScheme?.id,
    colorPool:
      colorScheme?.colorPool ?? appConfig?.colorPool ?? default_app_color,
    colorBy: colorScheme?.colorBy ?? appConfig?.colorBy ?? "field",
    colorscales:
      (colorScheme?.colorscales as ColorSchemeInput["colorscales"]) ?? [],
    defaultMaskTargetsColors: colorScheme?.defaultMaskTargetsColors ?? [],
    defaultColorscale: colorScheme?.defaultColorscale ?? {
      name: appConfig?.colorscale ?? "viridis",
      list: null,
    },
    fields: (colorScheme?.fields as ColorSchemeInput["fields"]) ?? [],
    labelTags: (colorScheme?.labelTags as ColorSchemeInput["labelTags"]) ?? {
      fieldColor: null,
      valueColors: [],
    },
    temporalTags: (colorScheme?.temporalTags as
      | ColorSchemeInput["temporalTags"]
      | undefined) ?? {
      fieldColor: null,
      valueColors: [],
    },
    multicolorKeypoints:
      typeof colorScheme?.multicolorKeypoints == "boolean"
        ? colorScheme.multicolorKeypoints
        : (appConfig?.multicolorKeypoints ?? false),
    opacity:
      typeof colorScheme?.opacity === "number" ? colorScheme.opacity : 0.7,
    showSkeletons:
      typeof colorScheme?.showSkeletons == "boolean"
        ? colorScheme.showSkeletons
        : (appConfig?.showSkeletons ?? true),
  };
};

export function removeRgbProperty(input) {
  // Clone the input to avoid mutating the original object
  const clonedInput = cloneDeep(input);

  // Process the 'colorscales' array
  if (clonedInput.colorscales && Array.isArray(clonedInput.colorscales)) {
    clonedInput.colorscales = clonedInput.colorscales.map(
      ({ rgb, ...rest }) => rest,
    );
  }

  // Process the 'defaultColorscale' object
  if (
    clonedInput.defaultColorscale &&
    typeof clonedInput.defaultColorscale === "object"
  ) {
    const { rgb, ...rest } = clonedInput.defaultColorscale;
    clonedInput.defaultColorscale = rest;
  }

  return clonedInput;
}
