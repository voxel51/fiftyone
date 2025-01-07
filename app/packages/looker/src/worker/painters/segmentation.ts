import { COLOR_BY, get32BitColor, rgbToHexCached } from "@fiftyone/utilities";
import type { SegmentationLabel } from "../../overlays/segmentation";
import { isRgbMaskTargets } from "../../overlays/util";
import type { MaskTargets, RgbMaskTargets } from "../../state";
import type { OverlayMask, TypedArray } from "../decoders/types";
import { ARRAY_TYPES } from "../decoders/types";
import makeMaskColorer from "./make-mask-colorer";
import type { Painter } from "./utils";
import { getFieldColor, getRgbFromMaskData, getTargets } from "./utils";

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
  const colorer = makeMaskColorer(coloring, fieldColor, setting);
  const zero = 0;
  // for loop should be fast
  for (let i = 0; i < targets.length; i++) {
    if (targets[i] === zero) {
      continue;
    }

    if (shouldClear(Number(targets[i]))) {
      targets[i] = zero;
    }

    overlay[i] = colorer[colorBy](i, targets);
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

export default segmentation;
