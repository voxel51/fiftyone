import { COLOR_BY } from "@fiftyone/utilities";
import type { SegmentationLabel } from "../../overlays/segmentation";
import type { MaskTargets } from "../../state";
import type { OverlayMask } from "../decoders/types";
import { ARRAY_TYPES } from "../decoders/types";
import makeMaskColorer from "./make-mask-colorer";
import type { Painter } from "./utils";
import { getFieldColor, getTargets } from "./utils";

const makeShouldClear = (maskTargets: MaskTargets) => {
  const isMaskTargetsEmpty = Object.keys(maskTargets).length === 0;
  return (target: number) => {
    if (isMaskTargetsEmpty) {
      return false;
    }

    return !(target in maskTargets);
  };
};

const panoptic: Painter<SegmentationLabel> = async ({
  field,
  label,
  coloring,
  customizeColorSetting,
}) => {
  console.log(label);
  if (!label?.mask) {
    return;
  }

  // the actual overlay that'll be painted, byte-length of width * height * 4
  // (RGBA channels)

  const maskTargets = getTargets(field, coloring);
  const maskData: OverlayMask = label.mask.data;

  // target map array
  const targets = new ARRAY_TYPES[maskData.arrayType](maskData.buffer);

  console.log(targets);
  const setting = customizeColorSetting.find((x) => x.path === field);
  const fieldColor = await getFieldColor(field, coloring, setting);
  console.log(label.mask);
  const overlay = new Uint32Array(label.mask.image);
  let colorBy = coloring.by;

  if (maskTargets && Object.keys(maskTargets).length === 1) {
    colorBy = COLOR_BY.FIELD;
  }

  const shouldClear = makeShouldClear(maskTargets);
  const colorer = makeMaskColorer(coloring, fieldColor, setting);
  const zero = 0;

  let tick = 1;
  let i = 0;
  let j = 0;

  if (colorBy === COLOR_BY.INSTANCE) {
    i = 1;
  }

  tick = maskData.channels;

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

export default panoptic;
