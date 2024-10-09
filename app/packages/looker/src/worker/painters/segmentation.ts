import { COLOR_BY, get32BitColor, rgbToHexCached } from "@fiftyone/utilities";
import type { OverlayMask } from "../../numpy";
import { ARRAY_TYPES } from "../../numpy";
import type { SegmentationLabel } from "../../overlays/segmentation";
import { convertToHex, isRgbMaskTargets } from "../../overlays/util";
import type { MaskTargets, RgbMaskTargets } from "../../state";
import type { Painter } from "./utils";
import {
  convertMaskColorsToObject,
  getRgbFromMaskData,
  requestColor,
} from "./utils";

const segmentation: Painter<SegmentationLabel> = async ({
  field,
  label,
  coloring,
  customizeColorSetting,
}) => {
  if (!label?.mask) {
    return;
  }

  // the actual overlay that'll be painted, byte-length of width * height * 4 (RGBA channels)
  const overlay = new Uint32Array(label.mask.image);

  // each field may have its own target map
  let maskTargets: MaskTargets = coloring.maskTargets[field];

  // or, in the absence of field specific targets, use default mask targets that are dataset scoped
  if (!maskTargets) {
    maskTargets = coloring.defaultMaskTargets;
  }

  const maskData: OverlayMask = label.mask.data;

  // target map array
  const targets = new ARRAY_TYPES[maskData.arrayType](maskData.buffer);

  const isMaskTargetsEmpty = Object.keys(maskTargets).length === 0;

  const isRgbMaskTargets_ = isRgbMaskTargets(maskTargets);

  if (maskData.channels > 2) {
    for (let i = 0; i < overlay.length; i++) {
      const [r, g, b] = getRgbFromMaskData(targets, maskData.channels, i);

      const currentHexCode = rgbToHexCached([r, g, b]);

      if (
        // #000000 is semantically treated as background
        currentHexCode === "#000000" ||
        // don't render color if hex is not in mask targets, unless mask targets is completely empty
        (!isMaskTargetsEmpty &&
          isRgbMaskTargets_ &&
          !(currentHexCode in maskTargets))
      ) {
        targets[i] = 0;
        continue;
      }

      overlay[i] = get32BitColor([r, g, b]);

      if (isRgbMaskTargets_) {
        targets[i] = (maskTargets as RgbMaskTargets)[currentHexCode].intTarget;
      } else {
        // assign an arbitrary uint8 value here; this isn't used anywhere but absence of it affects tooltip behavior
        targets[i] = r;
      }
    }

    // discard the buffer values of other channels
    maskData.buffer = maskData.buffer.slice(0, overlay.length);
  } else {
    const cache = {};

    let color;
    const setting = customizeColorSetting.find((x) => x.path === field);
    if (
      coloring.by === COLOR_BY.FIELD ||
      (maskTargets && Object.keys(maskTargets).length === 1)
    ) {
      let fieldColor;

      // if field color has valid custom settings, use the custom field color
      // convert the color into hex code, since it could be a color name (e.g. yellowgreen)
      fieldColor = setting?.fieldColor
        ? setting.fieldColor
        : await requestColor(coloring.pool, coloring.seed, field);
      color = get32BitColor(convertToHex(fieldColor));
    }

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

    // convert the defaultMaskTargetsColors and fields maskTargetsColors into objects to improve performance
    const defaultSetting = convertMaskColorsToObject(
      coloring.defaultMaskTargetsColors
    );
    const fieldSetting = convertMaskColorsToObject(setting?.maskTargetsColors);

    // these for loops must be fast. no "in" or "of" syntax
    for (let i = 0; i < overlay.length; i++) {
      if (targets[i] !== 0) {
        if (
          !(targets[i] in maskTargets) &&
          !isMaskTargetsEmpty &&
          !isRgbMaskTargets_
        ) {
          targets[i] = 0;
        } else {
          if (coloring.by === COLOR_BY.VALUE) {
            // Attempt to find a color in the fields mask target color settings
            // If not found, attempt to find a color in the default mask target colors.

            const target = targets[i].toString();
            const customColor =
              fieldSetting?.[target] || defaultSetting?.[target];

            // If a customized color setting is found, get the 32-bit color representation.
            if (customColor) {
              color = get32BitColor(convertToHex(customColor));
            } else {
              color = getColor(targets[i]);
            }
          }

          overlay[i] = color ? color : getColor(targets[i]);
        }
      }
    }
  }
};

export default segmentation;
