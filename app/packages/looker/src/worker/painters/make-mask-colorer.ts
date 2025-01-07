import { COLOR_BY, get32BitColor } from "@fiftyone/utilities";
import { convertToHex } from "../../overlays/util";
import type { Coloring, CustomizeColor } from "../../state";
import { convertMaskColorsToObject } from "./utils";

type Colorer = {
  [key in COLOR_BY]: (
    target: number | bigint,
    instance?: number | bigint
  ) => number;
};

const makeMaskColorer = (
  coloring: Coloring,
  fieldColor: number,
  setting: CustomizeColor
): Colorer => {
  let counter = 0;
  const cache: { [i: string]: number } = {};

  const getColor = (i: string) => {
    if (!(i in cache)) {
      cache[i] = get32BitColor(
        convertToHex(coloring.targets[counter % coloring.targets.length])
      );
      counter++;
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
    [COLOR_BY.INSTANCE]: (target, instance) => {
      return getColor(`${target}:${instance}`);
    },
    [COLOR_BY.VALUE]: (target) => {
      // Attempt to find a color in the fields mask target color settings
      // If not found, attempt to find a color in the default mask target
      // colors
      const targetString = target.toString();
      const customColor =
        fieldSetting?.[targetString] || defaultSetting?.[targetString];

      // If a customized color setting is found, get the 32-bit color
      // representation
      if (customColor) {
        return get32BitColor(convertToHex(customColor));
      }

      return getColor(targetString);
    },
  };
};

export default makeMaskColorer;
