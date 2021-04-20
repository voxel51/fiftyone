import _ from "lodash";

import { RESERVED_FIELDS } from "./labels";

let seedCache = 0;
let mapCache = {};
let poolCache = null;
let colorByLabelCache = false;

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
  seed: number,
  colorByLabel = false
): ColorMap {
  if (
    JSON.stringify(poolCache) !== JSON.stringify(colorPool) ||
    colorByLabelCache !== colorByLabel
  ) {
    poolCache = colorPool;
    mapCache = {};
  }
  const newMap = seed == seedCache ? Object.assign({}, mapCache) : {};
  seedCache = seed;
  let colors = Array.from(poolCache);

  keys = keys.filter((k) => !RESERVED_FIELDS.includes(k));

  if (seed > 0) {
    colors = shuffle(colors, seed);
  }
  let idx = 0;
  let offset = Object.keys(newMap).length;
  [...keys, undefined, null].sort().forEach((key) => {
    if (!newMap[key]) {
      let color = (offset + idx) % colors.length;
      if (isNaN(color)) {
        color = 0;
      }
      newMap[key] = colors[color];
      idx++;
    }
  });

  mapCache = newMap;
  return newMap;
}
