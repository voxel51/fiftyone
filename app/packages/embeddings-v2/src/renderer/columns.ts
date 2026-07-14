import type { Bounds, EmbeddingPoint } from "./types";

/**
 * Columnar copy of the data: typed arrays upload straight to the GPU and
 * scan fast for hit-testing. Built once per setData.
 */
export interface Columns extends Bounds {
  n: number;
  xs: Float32Array;
  ys: Float32Array;
  /** All zeros when the input carries no z (or z was flattened) */
  zs: Float32Array;
  /** True if any point carried a z and flattening was off */
  hasZ: boolean;
  ids: string[];
  labelIndex: Uint16Array;
  labelKeys: string[];
}

/**
 * `flattenZ` ignores z entirely (zs stay zero, hasZ stays false) — used
 * when the host provides no camera for z data, so it renders flat
 * instead of clipping against the planar camera's frustum.
 */
export function buildColumns(
  points: EmbeddingPoint[],
  flattenZ = false,
): Columns {
  const n = points.length;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const zs = new Float32Array(n);
  const ids = new Array<string>(n);
  const labelIndex = new Uint16Array(n);
  const labelKeys: string[] = [];
  const indexByLabel = new Map<string, number>();
  let hasZ = false;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let i = 0; i < n; i++) {
    const { id, x, y, z, label } = points[i];
    if (z !== undefined && !flattenZ) hasZ = true;
    const zValue = flattenZ ? 0 : (z ?? 0);
    xs[i] = x;
    ys[i] = y;
    zs[i] = zValue;
    ids[i] = id;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
    if (zValue < zMin) zMin = zValue;
    if (zValue > zMax) zMax = zValue;
    const key = String(label);
    let index = indexByLabel.get(key);
    if (index === undefined) {
      index = labelKeys.length;
      labelKeys.push(key);
      indexByLabel.set(key, index);
    }
    labelIndex[i] = index;
  }

  return {
    n,
    xs,
    ys,
    zs,
    hasZ,
    ids,
    labelIndex,
    labelKeys,
    xMin,
    xMax,
    yMin,
    yMax,
    zMin,
    zMax,
  };
}

/**
 * Bounds of the mask's visible subset (null mask = every point).
 * Returns null when nothing is visible — callers keep their previous
 * framing rather than framing an empty region.
 */
export function visibleBounds(
  cols: Columns,
  mask: Uint8Array | null,
): Bounds | null {
  if (!mask) {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = cols;
    return { xMin, xMax, yMin, yMax, zMin, zMax };
  }
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < cols.n; i++) {
    if (!mask[i]) continue;
    const x = cols.xs[i];
    const y = cols.ys[i];
    const z = cols.zs[i];
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  if (xMin === Infinity) return null;

  return { xMin, xMax, yMin, yMax, zMin, zMax };
}

/** Default coloring: label index -> palette, as flat rgb triplets */
export function colorsFromLabels(
  cols: Columns,
  palette: readonly string[],
): Float32Array {
  const paletteRgb = cols.labelKeys.map((_, i) => {
    const hex = palette[i % palette.length];
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  });
  const colors = new Float32Array(cols.n * 3);
  for (let i = 0; i < cols.n; i++) {
    colors.set(paletteRgb[cols.labelIndex[i]], i * 3);
  }
  return colors;
}
