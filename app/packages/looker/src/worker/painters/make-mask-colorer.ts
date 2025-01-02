import { COLOR_BY, get32BitColor } from "@fiftyone/utilities";
import type { TypedArray } from "../../numpy";
import { convertToHex } from "../../overlays/util";
import type { Coloring, CustomizeColor } from "../../state";
import { convertMaskColorsToObject } from "./utils";

type Colorer = {
  [key in COLOR_BY]: (i: number, targets: TypedArray) => number;
};

const makeMaskColorer = (
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

export default makeMaskColorer;
