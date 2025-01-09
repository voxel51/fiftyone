/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export const BIG_ENDIAN = (() => {
  let buf = new ArrayBuffer(4);
  let u32data = new Uint32Array(buf);
  let u8data = new Uint8Array(buf);
  u32data[0] = 0xcafebabe;
  return u8data[0] === 0xca;
})();

const bitColorCache: { [color: string]: number } = {};

export const getRGB = (color: string): RGB => {
  let r, g, b;

  if (color.startsWith("#")) {
    [r, g, b] = hexToRGB(color);
  } else if (color.startsWith("rgb")) {
    let sep = color.indexOf(",") > -1 ? "," : " ";
    [r, g, b] = color.slice(4).split(")")[0].split(sep);
  } else if (color.startsWith("hsl")) {
    [r, g, b] = hslToRGB(color);
  }

  return [r, g, b];
};

export const get32BitColor = (color: string | RGB, alpha: number = 1) => {
  alpha = Math.round(alpha * 255);
  const key = `${color}${alpha}`;
  if (key in bitColorCache) {
    return bitColorCache[key];
  }

  let r, g, b;

  if (typeof color === "string") {
    [r, g, b] = getRGB(color);
  } else {
    [r, g, b] = color;
  }

  bitColorCache[key] = BIG_ENDIAN
    ? (r << 24) | (g << 16) | (b << 8) | alpha
    : (alpha << 24) | (b << 16) | (g << 8) | r;

  return bitColorCache[key];
};

const rgbToHexCache = {};

export const rgbToHexCached = (color: RGB) => {
  const [r, g, b] = color;

  const key = `${r}${g}${b}`;

  if (key in rgbToHexCache) {
    return rgbToHexCache[`${r}${g}${b}`];
  }

  rgbToHexCache[key] =
    "#" +
    ((1 << 24) | (r << 16) | (g << 8) | b)
      // convert result of bitwise operation to hex
      .toString(16)
      // remove leading "1" that's a result of padding for bitwise ORs for RGB values above
      .slice(1)
      .toLocaleUpperCase();
  return rgbToHexCache[key];
};

export const getRGBA = (value: number): RGBA => {
  const uint32 = new Uint32Array(1);
  uint32[0] = value;

  return [...new Uint8Array(uint32.buffer)] as RGBA;
};

export const getRGBAColor = ([r, g, b, a]: RGBA) => {
  return `rgba(${r},${g},${b},${a / 255})`;
};

export const applyAlpha = (color: string, alpha: number): string => {
  return getRGBAColor([...getRGB(color), alpha]);
};

let rawColorscale = new Uint32Array(256);

let cachedColorscale = null;

export const getColorscaleArray = (
  colorscale: RGB[],
  alpha: number
): Readonly<Uint32Array> => {
  if (cachedColorscale !== colorscale) {
    cachedColorscale = colorscale;
    for (let i = 0; i < colorscale.length; i++) {
      rawColorscale[i] = get32BitColor(colorscale[i], alpha);
    }
  }

  return rawColorscale;
};

const hexToRGB = (hex: string): RGB => {
  let r = 0,
    g = 0,
    b = 0;

  if (hex.length == 4) {
    r = +("0x" + hex[1] + hex[1]);
    g = +("0x" + hex[2] + hex[2]);
    b = +("0x" + hex[3] + hex[3]);
  } else if (hex.length == 7) {
    r = +("0x" + hex[1] + hex[2]);
    g = +("0x" + hex[3] + hex[4]);
    b = +("0x" + hex[5] + hex[6]);
  }

  return [r, g, b];
};

const hslToRGB = (hsl): RGB => {
  let sep = hsl.indexOf(",") > -1 ? "," : " ";
  let [h, s, l] = hsl.slice(4).split(")")[0].split(sep);

  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r, g, b];
};

export const createColorGenerator = (() => {
  let poolCache: string[] = null;

  const shuffle = (array: string[], seed: number) => {
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
  };

  const random = (seed: number) => {
    const x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  };

  let colorMaps = {};

  return (
    colorPool: readonly string[],
    seed: number
  ): ((value: string | number | boolean | null) => string) => {
    if (JSON.stringify(poolCache) !== JSON.stringify(colorPool)) {
      colorMaps = {};
      poolCache = [...colorPool];
    }

    if (seed in colorMaps) {
      return colorMaps[seed];
    }

    colorPool = [...colorPool];

    if (seed > 0) {
      colorPool = shuffle([...colorPool], seed);
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
  };
})();

export const getColor = (
  pool: readonly string[],
  seed: number,
  fieldOrValue: string | number | boolean | null
) => {
  return createColorGenerator(pool ?? default_app_color, seed)(fieldOrValue);
};

// a function to convert a hex color to a rgb color
export const hexToRgb = (hex: string): RGB => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : null;
};

export const default_app_color = [
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
