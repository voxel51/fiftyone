import { get32BitColor } from "@fiftyone/utilities";
import colorString from "color-string";
import type { RegularLabel } from "../../overlays/base";
import type {
  Coloring,
  Colorscale,
  CustomizeColor,
  LabelTagColor,
  MaskColorInput,
  MaskTargets,
} from "../../state";
import type { IntermediateMask, TypedArray } from "../decoders/types";
import type { ReaderMethod } from "../types";

export type Painter<Label extends RegularLabel> = (params: {
  coloring: Coloring;
  colorscale: Colorscale;
  customizeColorSetting: CustomizeColor[];
  field: string;
  label: Label & { mask: IntermediateMask };
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

export const getFieldColor = async (
  field: string,
  coloring: Coloring,
  setting: CustomizeColor
) => {
  // if field color has valid custom settings, use the custom field color
  // convert the color into hex code, since it could be a color name
  // (e.g. yellowgreen)
  const fieldColorString = setting?.fieldColor
    ? setting.fieldColor
    : await requestColor(coloring.pool, coloring.seed, field);
  return get32BitColor(convertToHex(fieldColorString));
};

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

export const getTargets = (field: string, coloring: Coloring) => {
  // each field may have its own target map
  let maskTargets: MaskTargets = coloring.maskTargets[field];

  // or, in the absence of field specific targets, use default mask targets
  // that are dataset scoped
  if (!maskTargets) {
    maskTargets = coloring.defaultMaskTargets;
  }

  return maskTargets;
};

export const isFloatArray = (arr) =>
  arr instanceof Float32Array || arr instanceof Float64Array;

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
