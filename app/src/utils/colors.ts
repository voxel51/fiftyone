import _ from "lodash";
import randomColor from "randomcolor";

import { RESERVED_FIELDS } from "./labels";

let seedCache = 0;
let mapCache = {};

function shuffle(array: string[], seed: number) {
  let m = array.length,
    t,
    i;

  while (m) {
    i = Math.floor(random(seed) * m--);

    t = array[m];
    array[m] = array[i];
    array[i] = t;
    ++seed;
  }

  return array;
}

function random(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

type Color = string;
type ColorMap = { [name: string]: Color };

export function generateColorMap(
  colorPool: Color[],
  keys: string[],
  seed: number
): ColorMap {
  const newMap = seed == seedCache ? Object.assign({}, mapCache) : {};
  seedCache = seed;
  let colors = Array.from(colorPool);

  keys = keys.filter((k) => !RESERVED_FIELDS.includes(k));

  const iMap = _.invert(newMap);
  colors = colors.filter((color) => !iMap[color]);

  if (seed > 0) {
    colors = shuffle(colors, seed);
  }
  keys.forEach((key, i) => {
    if (!newMap[key]) {
      newMap[key] =
        colors.pop() || randomColor({ luminosity: "dark", seed: seed + i });
    }
  });

  mapCache = newMap;
  return newMap;
}
