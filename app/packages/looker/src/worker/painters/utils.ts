import colorString from "color-string";
import type { TypedArray } from "../../numpy";
import type { RegularLabel } from "../../overlays/base";
import type {
  Coloring,
  Colorscale,
  CustomizeColor,
  LabelTagColor,
  MaskColorInput,
} from "../../state";
import type { ReaderMethod } from "../types";

export type Painter<Label extends RegularLabel> = (params: {
  coloring: Coloring;
  colorscale: Colorscale;
  customizeColorSetting: CustomizeColor[];
  field: string;
  label: Label;
  labelTagColors: LabelTagColor;
  selectedLabelTags: string[];
}) => Promise<void>;

export interface ResolveColor {
  key: string | number;
  seed: number;
  color: string;
}

export type ResolveColorMethod = ReaderMethod & ResolveColor;

export const clampedIndex = (
  value: number,
  start: number,
  stop: number,
  length: number
) => {
  if (value < start) {
    return -1;
  }
  const clamped = Math.min(value, stop);
  return Math.round(
    (Math.max(clamped - start, 0) / (stop - start)) * (length - 1)
  );
};

export const convertToHex = (color: string) =>
  colorString.to.hex(colorString.get.rgb(color));

export const convertMaskColorsToObject = (array: MaskColorInput[]) => {
  const result = {};
  if (!array) return {};
  for (const item of array) {
    result[item.intTarget.toString()] = item.color;
  }
  return result;
};

export const isFloatArray = (arr) =>
  arr instanceof Float32Array || arr instanceof Float64Array;

export const getRgbFromMaskData = (
  maskTypedArray: TypedArray,
  channels: number,
  index: number
) => {
  const r = maskTypedArray[index * channels];
  const g = maskTypedArray[index * channels + 1];
  const b = maskTypedArray[index * channels + 2];

  return [r, g, b] as [number, number, number];
};

export const [requestColor, resolveColor] = ((): [
  (
    pool: readonly string[],
    seed: number,
    key: string | number
  ) => Promise<string>,
  (result: ResolveColor) => void
] => {
  const cache = {};
  const requests = {};
  const promises = {};

  return [
    (pool, seed, key) => {
      if (!(seed in cache)) {
        cache[seed] = {};
      }

      const colors = cache[seed];

      if (!(key in colors)) {
        if (!(seed in requests)) {
          requests[seed] = {};
          promises[seed] = {};
        }

        const seedRequests = requests[seed];
        const seedPromises = promises[seed];

        if (!(key in seedRequests)) {
          seedPromises[key] = new Promise((resolve) => {
            seedRequests[key] = resolve;
            postMessage({
              method: "requestColor",
              key,
              seed,
              pool,
            });
          });
        }

        return seedPromises[key];
      }

      return Promise.resolve(colors[key]);
    },
    ({ key, seed, color }) => {
      requests[seed][key](color);
    },
  ];
})();
