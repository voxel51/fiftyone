import { COLOR_BY, get32BitColor, rgbToHexCached } from "@fiftyone/utilities";
import type { OverlayMask, TypedArray } from "../../numpy";
import { ARRAY_TYPES } from "../../numpy";
import type { SegmentationLabel } from "../../overlays/segmentation";
import { convertToHex, isRgbMaskTargets } from "../../overlays/util";
import type {
  Coloring,
  CustomizeColor,
  MaskTargets,
  RgbMaskTargets,
} from "../../state";
import type { Painter } from "./utils";
import {
  convertMaskColorsToObject,
  getRgbFromMaskData,
  requestColor,
} from "./utils";

const usingBigInts = (targets: TypedArray) => {
  return targets instanceof BigInt64Array || targets instanceof BigUint64Array;
};

const getTargets = (field: string, coloring: Coloring) => {
  // each field may have its own target map
  let maskTargets: MaskTargets = coloring.maskTargets[field];

  // or, in the absence of field specific targets, use default mask targets
  // that are dataset scoped
  if (!maskTargets) {
    maskTargets = coloring.defaultMaskTargets;
  }

  return maskTargets;
};

const getGuard = (maskTargets: MaskTargets) => {
  const isMaskTargetsEmpty = Object.keys(maskTargets).length === 0;
  const useRgbTargets = isRgbMaskTargets(maskTargets);

  return {
    guard: (hex: string) => {
      // #000000 is semantically treated as background
      return (
        hex === "#000000" ||
        // don't render color if hex is not in mask targets, unless mask
        // targets is completely empty
        (!isMaskTargetsEmpty && useRgbTargets && !(hex in maskTargets))
      );
    },
    useRgbTargets,
  };
};

const handleRgb = (
  maskData: OverlayMask,
  maskTargets: MaskTargets,
  overlay: Uint32Array,
  targets: TypedArray
) => {
  const { guard, useRgbTargets } = getGuard(maskTargets);

  for (let i = 0; i < overlay.length; i++) {
    const [r, g, b] = getRgbFromMaskData(targets, maskData.channels, i);

    const currentHexCode = rgbToHexCached([r, g, b]);

    if (guard(currentHexCode)) {
      targets[i] = 0;
      continue;
    }

    overlay[i] = get32BitColor([r, g, b]);

    if (useRgbTargets) {
      targets[i] = (maskTargets as RgbMaskTargets)[currentHexCode].intTarget;
      continue;
    }

    // assign an arbitrary uint8 value here; this isn't used anywhere but
    // absence of it affects tooltip behavior
    targets[i] = r;
  }

  // discard the buffer values of other channels
  maskData.buffer = maskData.buffer.slice(0, overlay.length);
};

const segmentation: Painter<SegmentationLabel> = async ({
  field,
  label,
  coloring,
  customizeColorSetting,
}) => {
  if (!label?.mask) {
    return;
  }

  // the actual overlay that'll be painted, byte-length of width * height * 4
  // (RGBA channels)

  const maskTargets = getTargets(field, coloring);
  const maskData: OverlayMask = label.mask.data;

  // target map array
  const targets = new ARRAY_TYPES[maskData.arrayType](maskData.buffer);

  const setting = customizeColorSetting.find((x) => x.path === field);
  const fieldColor = await getFieldColor(field, coloring, setting);
  const overlay = new Uint32Array(label.mask.image);
  if (maskData.channels > 2) {
    handleRgb(maskData, maskTargets, overlay, targets);
    return;
  }
  let colorBy = coloring.by;

  if (maskTargets && Object.keys(maskTargets).length === 1) {
    colorBy = COLOR_BY.FIELD;
  }

  const shouldClear = makeShouldClear(maskTargets);
  const colorer = makeColorer(coloring, fieldColor, setting);
  const zero = usingBigInts(targets) ? 0n : 0;

  let tick = 1;
  let i = 0;
  let j = 0;
  if (label.is_panoptic) {
    if (colorBy === COLOR_BY.INSTANCE) {
      i = 1;
    }

    tick = maskData.channels;
  }

  // while loop should be fast
  while (i < targets.length) {
    if (targets[i] === zero) {
      i += tick;
      j++;
      continue;
    }

    if (shouldClear(Number(targets[i]))) {
      targets[i] = zero;
    }

    overlay[j] = colorer[colorBy](i, targets);
    i += tick;
    j++;
  }
};

const makeShouldClear = (maskTargets: MaskTargets) => {
  const isMaskTargetsEmpty = Object.keys(maskTargets).length === 0;
  const useRgbTargets = isRgbMaskTargets(maskTargets);
  return (target: number) => {
    if (isMaskTargetsEmpty || useRgbTargets) {
      return false;
    }

    return !(target in maskTargets);
  };
};

type Colorer = {
  [key in COLOR_BY]: (i: number, targets: TypedArray) => number;
};

const makeColorer = (
  coloring: Coloring,
  fieldColor: number,
  setting: CustomizeColor
): Colorer => {
  const cache: { [i: number]: number } = {};

  const getColor = (i: number) => {
    if (!(i in cache)) {
      cache[i] = get32BitColor(
        convertToHex(
          coloring.targets[Math.round(Math.abs(i)) % coloring.targets.length]
        )
      );
    }

    return cache[i];
  };

  // convert the defaultMaskTargetsColors and fields maskTargetsColors into
  // objects to improve performance
  const defaultSetting = convertMaskColorsToObject(
    coloring.defaultMaskTargetsColors
  );
  const fieldSetting = convertMaskColorsToObject(setting?.maskTargetsColors);

  return {
    [COLOR_BY.FIELD]: () => fieldColor,
    [COLOR_BY.INSTANCE]: (i: number, targets: TypedArray) => {
      return getColor(Number(targets[i]));
    },
    [COLOR_BY.VALUE]: (i: number, targets: TypedArray) => {
      // Attempt to find a color in the fields mask target color settings
      // If not found, attempt to find a color in the default mask target
      // colors
      const targetString = targets[i].toString();
      const customColor =
        fieldSetting?.[targetString] || defaultSetting?.[targetString];

      // If a customized color setting is found, get the 32-bit color
      // representation
      if (customColor) {
        return get32BitColor(convertToHex(customColor));
      }

      return getColor(targets[i]);
    },
  };
};

const getFieldColor = async (
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

export default segmentation;
