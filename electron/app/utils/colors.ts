import _ from "lodash";
import randomColor from "randomcolor";

const FIXED_COLORS = [
  "#ee0000",
  "#ee6600",
  "#993300",
  "#996633",
  "#999900",
  "#009900",
  "#003300",
  "#009999",
  "#000099",
  "#0066ff",
  "#6600ff",
  "#cc33cc",
  "#777799",
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
