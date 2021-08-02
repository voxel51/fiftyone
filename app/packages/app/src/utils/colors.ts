let poolCache: string[] = null;

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

let colorMaps = {};

export function generateColorMap(
  colorPool: string[],
  seed: number
): (value) => string {
  if (JSON.stringify(poolCache) !== JSON.stringify(colorPool)) {
    colorMaps = {};
    poolCache = colorPool;
  }

  colorPool = [...colorPool];

  if (seed in colorMaps) {
    return colorMaps[seed];
  }

  if (seed > 0) {
    colorPool = shuffle(colorPool, seed);
  }

  let map = {};
  let i = 0;

  colorMaps[seed] = (val) => {
    if (val in map) {
      return map[val];
    }

    map[val] = colorPool[i % colorPool.length];
    i++;
    return map[val];
  };

  return colorMaps[seed];
}
