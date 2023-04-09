import { CustomizeColor, useUnprocessedStateUpdate } from "@fiftyone/state";
import { useErrorHandler } from "react-error-boundary";
import {
  atom,
  selector,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import * as fos from "@fiftyone/state";
import { isEmpty, xor } from "lodash";
import styled from "styled-components";

export const tempColorSetting = atom<CustomizeColor>({
  key: "tempAttributeColorSetting",
  default: {},
});

export const tempGlobalSetting = atom<GlobalColorSetting>({
  key: "tempGlobalSetting",
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
  };
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
