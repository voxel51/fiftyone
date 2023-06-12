import * as fos from "@fiftyone/state";
import { isEmpty, xor } from "lodash";

// Masataka Okabe and Kei Ito have proposed a palette of 8 colors on their
// website Color Universal Design (CUD). This palette is a “Set of colors that
// is unambiguous both to colorblinds and non-colorblinds”.
//
// https://jfly.uni-koeln.de/color/
export const colorBlindFriendlyPalette = [
  "#E69F00", // orange
  "#56b4e9", // skyblue
  "#009e74", // bluegreen
  "#f0e442", // yellow
  "#0072b2", // blue
  "#d55e00", // vermillion
  "#cc79a7", // reddish purple
];

export const fiftyoneDefaultColorPalette = [
  "#ee0000",
  "#ee6600",
  "#993300",
  "#996633",
  "#999900",
  "#009900",
  "#003300",
  "#009999",
  "#000099",
  "#0066ff",
  "#6600ff",
  "#cc33cc",
  "#777799",
];

export const ACTIVE_FIELD = {
  ["json"]: "JSON editor",
  ["global"]: "Global settings",
  ["_label_tags"]: "label tags",
};

// disregard the order
export const isSameArray = (a: any[], b: any[]) => {
  return isEmpty(xor(a, b));
};

export const isString = (v: unknown) => typeof v === "string";
export const isObject = (v: unknown) => typeof v === "object" && v != null;
export const isBoolean = (v: unknown) => typeof v === "boolean";

const getValidLabelColors = (labelColors: unknown[]) => {
  return labelColors?.filter((x) => {
    return (
      x &&
      isObject(x) &&
      isString(x["value"]) &&
      x["value"] !== "" &&
      isString(x["color"])
    );
  }) as { value: string; color: string }[];
};

// should return a valid customize color object that can be used to setCustomizeColor
export const validateJSONSetting = (json: unknown[]) => {
  const filtered = json?.filter(
    (s) => s && isObject(s) && isString(s["path"])
  ) as {}[];

  const f = filtered?.map((input) => ({
    path: input["path"],
    fieldColor: input["fieldColor"] ?? null,
    colorByAttribute: isString(input["colorByAttribute"])
      ? input["colorByAttribute"]
      : null,
    valueColors: Array.isArray(input["valueColors"])
      ? getValidLabelColors(input["valueColors"])
      : null,
  })) as fos.CustomizeColor[];

  // remove default settings
  return f.filter((x) => {
    const hasFieldSetting = x.fieldColor;
    const hasAttributeColor = x.colorByAttribute;
    const hasLabelColors = x.valueColors && x.valueColors.length > 0;
    return hasFieldSetting || hasAttributeColor || hasLabelColors;
  }) as fos.CustomizeColor[];
};

export const isDefaultSetting = (savedSetting: fos.ColorScheme) => {
  return (
    isSameArray(
      savedSetting.colorPool,
      fos.DEFAULT_APP_COLOR_SCHEME.colorPool
    ) &&
    (savedSetting.fields?.length == 0 || !savedSetting.fields)
  );
};

export const getDisplayName = (path: string) => {
  if (path === "tags") {
    return "sample tags";
  }
  return path;
};
