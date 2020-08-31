import _ from "lodash";
import randomColor from "randomcolor";

import { RESERVED_FIELDS } from "./labels";

const FIXED_COLORS = ["red", "green", "blue"];

type Color = string;
type ColorMap = { [name: string]: Color };

export function generateColorMap(
  names: string[],
  existingMap: ColorMap = {}
): ColorMap {
  let newMap = {};

  const availableColors = new Set(FIXED_COLORS);
  for (const [name, color] of Object.entries(existingMap || {})) {
    if (names.includes(name)) {
      availableColors.delete(color);
      newMap[name] = color;
    }
  }

  const remainingColors = _.shuffle(Array.from(availableColors));
  for (const name of names) {
    if (!newMap[name]) {
      newMap[name] =
        remainingColors.pop() || randomColor({ luminosity: "dark" });
    }
  }

  return newMap;
}
