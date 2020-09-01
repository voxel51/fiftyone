import _ from "lodash";
import randomColor from "randomcolor";

// From https://en.wikipedia.org/wiki/Help:Distinguishable_colors
const FIXED_COLORS = [
  "#0075DC", // blue
  "#993F00", // caramel
  "#4C005C", // damson
  "#005C31", // forest
  "#C20088", // mallow
  "#003380", // navy
  "#00998F", // turquoise
  "#990000", // wine
];

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
