import { COLOR_BY } from "@fiftyone/utilities";
import type { PanopticSegmentationLabel } from "../../overlays/panoptic";
import type { MaskTargets } from "../../state";
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

const panoptic: Painter<PanopticSegmentationLabel> = async ({
  field,
  label,
  coloring,
  customizeColorSetting,
}) => {
  if (!label?.mask) {
    return;
  }

  const maskTargets = getTargets(field, coloring);
  const maskData = label.mask.data;
  const [height, width] = label.mask.data.shape;
  const channels = label.mask.data.channels;

  // target map array
  const targets = new ARRAY_TYPES[maskData.arrayType](maskData.buffer);

  const setting = customizeColorSetting.find((x) => x.path === field);
  const fieldColor = await getFieldColor(field, coloring, setting);
  const overlay = new Uint32Array(label.mask.image);
  let colorBy = coloring.by;

  if (maskTargets && Object.keys(maskTargets).length === 1) {
    colorBy = COLOR_BY.FIELD;
  }

  const shouldClear = makeShouldClear(maskTargets);
  const colorer = makeMaskColorer(coloring, fieldColor, setting);
  const zero = 0;

  const tick = height * channels;
  let counter = 0;
  let classCounter = 0;
  let loops = 1;
  const total = height * width;

  const increment = () => {
    classCounter += tick;
    if (classCounter >= targets.length) {
      classCounter = loops;
      loops++;
    }
    counter++;
  };

  // while loop should be fast
  while (counter < total) {
    if (targets[classCounter] !== zero) {
      if (shouldClear(Number(targets[classCounter]))) {
        targets[classCounter] = zero;
      }

      overlay[counter] = colorer[colorBy](
        targets[classCounter],
        targets[classCounter + height]
      );
    }

    increment();
  }
};

export default panoptic;
