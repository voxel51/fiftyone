import { CustomizeColor } from "@fiftyone/state";
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
      isString(x["name"]) &&
      x["name"] !== "" &&
      isString(x["color"])
    );
  }) as { name: string; color: string }[];
};

// should return a valid customize color object that can be used to setCustomizeColor
export const validateJSONSetting = (json: unknown[]) => {
  const filtered = json?.filter(
    (s) => s && isObject(s) && isString(s["field"])
  ) as {}[];

  const f = filtered?.map((input) => ({
    field: input["field"],
    useFieldColor: isBoolean(input["useFieldColor"])
      ? input["useFieldColor"]
      : false,
    fieldColor: input["fieldColor"] ?? null,
    attributeForColor:
      isString(input["attributeForColor"]) &&
      input["attributeForColor"] !== "label"
        ? input["attributeForColor"]
        : null,
    // attributeForOpacity: isString(input["attributeForOpacity"])
    //   ? input["attributeForOpacity"]
    //   : null,
    labelColors: Array.isArray(input["labelColors"])
      ? getValidLabelColors(input["labelColors"])
      : null,
  })) as CustomizeColor[];

  // remove default settings
  return f.filter((x) => {
    const hasFieldSetting = x.useFieldColor && x.fieldColor;
    const hasAttributeColor = x.attributeForColor;
    const hasLabelColors = x.labelColors && x.labelColors.length > 0;
    return hasFieldSetting || hasAttributeColor || hasLabelColors;
  }) as CustomizeColor[];
};

type ColorSchemeStr = {
  colorPool: string[];
  customizedColorSettings: string;
};

export const isDefaultSetting = (savedSetting: ColorSchemeStr) => {
  return (
    isSameArray(
      savedSetting.colorPool,
      fos.DEFAULT_APP_COLOR_SCHEME.colorPool
    ) &&
    (savedSetting.customizedColorSettings ==
      JSON.stringify(fos.DEFAULT_APP_COLOR_SCHEME.customizedColorSettings) ||
      !savedSetting.customizedColorSettings)
  );
};
