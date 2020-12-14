import _ from "lodash";
import randomColor from "randomcolor";

// From https://en.wikipedia.org/wiki/Help:Distinguishable_colors
export const FIXED_COLORS = [
  "#0075DC", // blue
  "#993F00", // caramel
  "#4C005C", // damson
  "#005C31", // forest
  "#2BAE28", // green (dimmed)
  "#8F7C00", // khaki
  "#C20088", // mallow
  "#003380", // navy
  "#EE8005", // orpiment (dimmed)
  "#FF0010", // red
  "#00998F", // turquoise
  "#740AFF", // violet
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
