import _ from "lodash";
import randomColor from "randomcolor";

function shuffle(array, seed) {
  var m = array.length,
    t,
    i;

  // While there remain elements to shuffle…
  while (m) {
    // Pick a remaining element…
    i = Math.floor(random(seed) * m--);

    // And swap it with the current element.
    t = array[m];
    array[m] = array[i];
    array[i] = t;
    ++seed;
  }

  return array;
}

function random(seed) {
  var x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

type Color = string;
type ColorMap = { [name: string]: Color };

export function generateColorMap(
  colorPool: Color[],
  keys: string[],
  seed: number
): ColorMap {
  const newMap = {};
  let colors = Array.from(colorPool);
  if (seed > 0) {
    colors = shuffle(colors, seed);
  }
  for (const key of keys) {
    if (!newMap[key]) {
      newMap[key] = keys.pop() || randomColor({ luminosity: "dark", seed });
    }
  }

  return newMap;
}
