/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

// The tokens subpath is pure data — no React, no globals.css — so it is safe
// to import here, where this module also runs inside looker's workers
import { palettePool } from "@voxel51/voodo/tokens";

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
    [r, g, b] = color.slice(4).split(")")[0].split(sep).map(Number);
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

/**
 * Convert RGB string to hex
 *
 * @param rgb - RGB string (e.g. "rgb(255, 255, 255)")
 * @returns hex string (e.g. "#ffffff")
 * @throws if the RGB string is invalid
 */
export const rgbStringToHex = (rgb: string): string => {
  const match = rgb.match(
    /^rgb\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)$/i,
  );

  if (!match) {
    throw new Error(`Invalid RGB string: ${rgb}`);
  }

  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);

  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
    throw new Error(`Invalid RGB string: ${rgb}`);
  }

  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  );
};

export const getRGBA = (value: number): RGBA => {
  const uint32 = new Uint32Array(1);
  uint32[0] = value;

  return [...new Uint8Array(uint32.buffer)] as RGBA;
};

export const getRGBAColor = ([r, g, b, a]: RGBA) => {
  return `rgba(${r},${g},${b},${a <= 1 ? a : a / 255})`;
};

export const applyAlpha = (color: string, alpha: number): string => {
  return getRGBAColor([...getRGB(color), alpha]);
};

let rawColorscale = new Uint32Array(256);

let cachedColorscale = null;

export const getColorscaleArray = (
  colorscale: RGB[],
  alpha: number,
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
    seed: number,
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
  fieldOrValue: string | number | boolean | null,
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

export const interpolateColorsHex = (
  color1: string,
  color2: string,
  factor: number,
): string => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return color1;

  // clamp factor between 0 and 1
  const clampedFactor = Math.min(1, Math.max(0, factor));

  const [r, g, b] = interpolateColorsRgb(rgb1, rgb2, clampedFactor);

  return rgbToHexCached([r, g, b]);
};

export const interpolateColorsRgb = (
  rgb1: RGB,
  rgb2: RGB,
  factor: number,
): RGB => {
  return [
    Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * factor),
    Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * factor),
    Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * factor),
  ];
};

/**
 * The App's default color pool, from the Voodo design system.
 *
 * The server has no notion of theme, and dark is the App's default, so the
 * dark palette is used — the two are identical today.
 */
export const default_app_color = palettePool.dark;
/**
 * The App's curated continuous ramps, tuned for a dark canvas. The single
 * home for these definitions: consumers (e.g. the embeddings plot's palette
 * picker) read them from here and write a pick into the color scheme as a
 * plain `{ value, color }` list — the same wire shape the color settings
 * modal's list tab writes and the server resolves to rgb.
 *
 * None of these clip: the ends of a ramp are the true extremes. What a ramp
 * changes is WHERE the perceptual contrast sits, which is the whole point
 * when the interesting values are the rare ones at the edges.
 */
export interface ContinuousRamp {
  label: string;
  hint: string;
  /** Evenly-spaced stops, 0-1 floats per channel. */
  stops: readonly RGB[];
  /** Anchors the MIDDLE stop at zero by making the consumer's value domain
   * symmetric (±max(|min|, |max|)). Without it zero lands wherever it
   * happens to fall, so a left turn and a right turn of equal size read as
   * the same colour. */
  diverging?: boolean;
}

export const CONTINUOUS_RAMPS = {
  blueOrange: {
    label: "Blue → orange",
    hint: "Two-tone; extremes at the ends",
    stops: [
      [0.15, 0.4, 0.9],
      [1.0, 0.65, 0.0],
    ],
  },
  coolWarm: {
    label: "Diverging (zero-centered)",
    hint: "Signed data: zero is neutral, each direction its own hue",
    diverging: true,
    stops: [
      [0.23, 0.3, 0.75],
      [0.87, 0.87, 0.87],
      [0.71, 0.02, 0.15],
    ],
  },
  viridis: {
    label: "Viridis",
    hint: "Even contrast throughout; best when most values sit mid-range",
    // Viridis sampled from its upper three quarters, not from zero. A dark
    // canvas swallows canonical viridis' near-black start, and the lowest
    // values — a whole end of the range — simply would not be there.
    stops: [
      [0.229, 0.322, 0.545],
      [0.147, 0.47, 0.558],
      [0.216, 0.667, 0.5],
      [0.612, 0.858, 0.286],
      [0.993, 0.906, 0.144],
    ],
  },
  cool: {
    label: "Cool",
    hint: "Cyan → magenta; saturated at both ends",
    stops: [
      [0.0, 0.9, 1.0],
      [1.0, 0.2, 0.95],
    ],
  },
  spring: {
    label: "Spring",
    hint: "Magenta → yellow; saturated at both ends",
    stops: [
      [1.0, 0.1, 0.85],
      [1.0, 0.95, 0.2],
    ],
  },
  rainbow: {
    label: "Rainbow",
    hint: "Most separation between nearby values; ranks poorly by eye",
    // Full-hue sweep, but lifted off pure red and pure blue: those are the
    // two dark corners of a canonical rainbow (luminance 0.21 and 0.07) and
    // they are what makes its ends vanish on a dark canvas.
    //
    // Brightness does NOT track value here — it rises, falls and rises
    // again — so this shows WHICH values differ, not which is greater. That
    // is the trade a rainbow makes, and the reason it is not the default.
    stops: [
      [1.0, 0.25, 0.25],
      [1.0, 0.85, 0.1],
      [0.25, 0.95, 0.35],
      [0.2, 0.85, 1.0],
      [0.55, 0.45, 1.0],
    ],
  },
} satisfies Record<string, ContinuousRamp>;

export type ContinuousRampId = keyof typeof CONTINUOUS_RAMPS;

export const CONTINUOUS_RAMP_IDS = Object.keys(
  CONTINUOUS_RAMPS,
) as ContinuousRampId[];

const rampChannelHex = (channel: number): string =>
  Math.round(channel * 255)
    .toString(16)
    .padStart(2, "0");

const rampStopHex = ([r, g, b]: RGB): string =>
  `#${rampChannelHex(r)}${rampChannelHex(g)}${rampChannelHex(b)}`;

/** A ramp's stops in the color scheme's `list` wire shape (evenly spaced). */
export function rampList(
  rampId: ContinuousRampId,
): { value: number; color: string }[] {
  const stops = CONTINUOUS_RAMPS[rampId].stops;
  const span = Math.max(1, stops.length - 1);
  return stops.map((stop, i) => ({
    value: i / span,
    color: rampStopHex(stop),
  }));
}

/** A left-to-right CSS gradient of a whole ramp — one color stop per ramp
 * stop, so the bar a picker row draws is the ramp the consumer gets. */
export function rampGradient(rampId: ContinuousRampId): string {
  const parts = rampList(rampId).map(
    ({ value, color }) => `${color} ${value * 100}%`,
  );
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

/** Which ramp a scheme colorscale entry is, or null for a custom or absent
 * one (e.g. a named scale or hand-edited list in the color settings modal). */
export function rampIdForEntry(entry: unknown): ContinuousRampId | null {
  const list = (entry as { list?: unknown } | null | undefined)?.list;
  if (!Array.isArray(list)) return null;
  for (const rampId of CONTINUOUS_RAMP_IDS) {
    const stops = rampList(rampId);
    if (
      list.length === stops.length &&
      stops.every(
        (stop, i) =>
          list[i] &&
          Number(list[i].value) === stop.value &&
          String(list[i].color).toLowerCase() === stop.color,
      )
    ) {
      return rampId;
    }
  }
  return null;
}

/** The domain a zero-centered read maps signed values through: symmetric
 * (±max(|min|, |max|)) so the ramp's MIDDLE stop is zero. Untouched for
 * data that does not cross zero. */
export function divergingDomain(min: number, max: number): [number, number] {
  if (min < 0 && max > 0) {
    const m = Math.max(Math.abs(min), Math.abs(max)) || 1;
    return [-m, m];
  }
  return [min, max];
}

/** The values a ramp's two ends stand for: a diverging ramp is symmetric
 * about zero so its middle stop IS zero; every other ramp spans min..max.
 * A legend reads its labels from here, so it cannot name a value at an end
 * that end was never given. */
export function rampDomain(
  lo: number,
  hi: number,
  ramp: ContinuousRamp,
): [number, number] {
  return ramp.diverging ? divergingDomain(lo, hi) : [lo, hi];
}
