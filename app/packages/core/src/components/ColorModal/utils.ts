import { CustomizeColor, useUnprocessedStateUpdate } from "@fiftyone/state";
import { useErrorHandler } from "react-error-boundary";
import { atom } from "recoil";
import * as fos from "@fiftyone/state";
import { isEmpty, xor } from "lodash";
import styled from "styled-components";
import { Field } from "@fiftyone/utilities";

type ColorJSON = {
  colorScheme: string[];
  customizedColorSettings: CustomizeColor[];
};

export const tempColorSetting = atom<CustomizeColor>({
  key: "tempAttributeColorSetting",
  default: {},
});

export const tempGlobalSetting = atom<GlobalColorSetting>({
  key: "tempGlobalSetting",
  default: {},
});

export const tempColorJSON = atom<ColorJSON>({
  key: "tempColorJSON",
  default: {},
});

export const useSetCustomizeColor = () => {};

// Masataka Okabe and Kei Ito have proposed a palette of 8 colors on their website Color Universal Design (CUD). This palette is a “Set of colors that is unambiguous both to colorblinds and non-colorblinds”.
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

type GlobalColorSetting = {
  colorBy: "field" | "value";
  colors: string[];
  opacity: number;
  useMulticolorKeypoints: boolean;
  showSkeleton: boolean;
};

export const isSameArray = (a: any[], b: any[]) => {
  return isEmpty(xor(a, b));
};

export const updateFieldSettings = (tempColor) => {
  const { useLabelColors, useOpacity } = tempColor;
  return {
    ...tempColor,
    labelColors: useLabelColors ? tempColor.labelColors : undefined,
    attributeForOpacity: useOpacity ? tempColor.attributeForOpacity : undefined,
    fieldColor: tempColor.useFieldColor ? tempColor.fieldColor : undefined,
  };
};

export const isString = (v: unknown) => typeof v === "string";
export const isObject = (v: unknown) => typeof v === "object" && v != null;
export const isBoolean = (v: unknown) => typeof v === "boolean";

const getValidLabelColors = (labelColors: unknown[]) =>
  (
    labelColors?.filter((x) => {
      x && isObject(x) && isString(x["name"]) && isString(x["color"]);
    }) as { name: string; color: string }[]
  )?.map(({ name, color }) => ({ name, color }));

const isValidFieldPath = (str: string, fields: Field[]) =>
  fields.map((f) => f.path).includes(str);

// should return a valid customize color object that can be used to setCustomizeColor
export const validateJSONSetting = (json: unknown[], fields: Field[]) => {
  const filtered = json?.filter(
    (s) =>
      s &&
      isObject(s) &&
      isString(s["field"]) &&
      isValidFieldPath(s["field"], fields)
  ) as {}[];

  return filtered?.map((input) => ({
    field: input["field"],
    useFieldColor: isBoolean(input["useFieldColor"])
      ? input["useFieldColor"]
      : false,
    fieldColor: (
      isBoolean(input["useFieldColor"]) ? input["useFieldColor"] : false
    )
      ? input["fieldColor"]
      : null,
    attributeForColor: isString(input["attributeForColor"])
      ? input["attributeForColor"]
      : null, // TODO: need to handle when it is not valid field path in looker
    useOpacity: isBoolean(input["useOpacity"]) ? input["useOpacity"] : false,
    attributeForOpacity: isString(input["attributeForOpacity"])
      ? input["attributeForOpacity"]
      : null, // TODO: need to handle when it is not valid field path in looker
    useLabelColors: isBoolean(input["useLabelColors"])
      ? input["useLabelColors"]
      : false,
    labelColors:
      (isBoolean(input["useLabelColors"]) ? input["useLabelColors"] : false) &&
      Array.isArray(input["labelColors"])
        ? getValidLabelColors(input["labelColors"])
        : undefined,
  }));
};

// shared styled.div
export const ControlGroupWrapper = styled.div`
  margin: 0.5rem 2rem;
`;

export const SectionWrapper = styled.div`
  margin: 0.5rem 1rem;
`;

export const LabelTitle = styled.div`
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
  font-size: 1rem;
  line-height: 2;
  font-weight: bold;
`;
