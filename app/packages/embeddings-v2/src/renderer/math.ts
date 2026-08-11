// Pure geometry — no three.js, no DOM. Everything here is directly
// unit-testable: the planar camera's viewport algebra, the lasso's
// point-in-polygon test, and the projected hit-tests shared by both
// camera modes.
import type { Columns } from "./columns";
import type { Bounds, HoverHit, Polygon } from "./types";

/** A visible data-space window (y up, like the data — not screen y) */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Home view for the planar camera: the data extent contain-fit in the
 * viewport, inset by `margin` px on every side. One shared data-per-px
 * scale serves both axes, so the plot keeps its shape at any viewport
 * size — the axis with slack gets centered padding instead of a
 * stretch. Degenerate extents (single point) get a unit span so the
 * math stays finite.
 */
export function fitRect(
  bounds: Pick<Bounds, "xMin" | "xMax" | "yMin" | "yMax">,
  width: number,
  height: number,
  margin: number,
): Rect {
  const spanX = bounds.xMax - bounds.xMin || 1;
  const spanY = bounds.yMax - bounds.yMin || 1;
  // Guard tiny viewports: never let the usable area hit zero
  const usableX = Math.max(width - 2 * margin, 1);
  const usableY = Math.max(height - 2 * margin, 1);
  // The tighter axis picks the scale, so the data always fits whole
  const perPx = Math.max(spanX / usableX, spanY / usableY);
  const cx = (bounds.xMin + bounds.xMax) / 2;
  const cy = (bounds.yMin + bounds.yMax) / 2;
  const halfX = (width * perPx) / 2;
  const halfY = (height * perPx) / 2;
  return { x0: cx - halfX, x1: cx + halfX, y0: cy - halfY, y1: cy + halfY };
}

/** Zoom level of a rect relative to home (1 = home, bigger = closer) */
export function zoomOf(rect: Rect, home: Rect): number {
  return (home.x1 - home.x0) / (rect.x1 - rect.x0);
}

/** Map a CSS-px position inside the viewport to data coordinates */
export function pxToData(
  rect: Rect,
  width: number,
  height: number,
  px: number,
  py: number,
): [number, number] {
  return [
    rect.x0 + (px / width) * (rect.x1 - rect.x0),
    // Screen y points down, data y points up
    rect.y1 - (py / height) * (rect.y1 - rect.y0),
  ];
}

/** Slide a rect so it stays fully inside home (assumes rect fits) */
export function clampToHome(rect: Rect, home: Rect): Rect {
  let { x0, y0, x1, y1 } = rect;
  if (x0 < home.x0) {
    x1 += home.x0 - x0;
    x0 = home.x0;
  }
  if (x1 > home.x1) {
    x0 -= x1 - home.x1;
    x1 = home.x1;
  }
  if (y0 < home.y0) {
    y1 += home.y0 - y0;
    y0 = home.y0;
  }
  if (y1 > home.y1) {
    y0 -= y1 - home.y1;
    y1 = home.y1;
  }
  return { x0, y0, x1, y1 };
}

/**
 * The camera's world: the view at minimum zoom, home scaled about its
 * center by 1/minZoom. Every zoom level is a window into this fixed
 * rect and the single camera rule is "the window stays inside the
 * world" — so pan already works at the default fit view (the window is
 * smaller than the world), zooming out grows the window toward the
 * world, and the view is never more lost than reset can recover.
 */
export function worldRect(home: Rect, minZoom: number): Rect {
  const gx = ((home.x1 - home.x0) * (1 / minZoom - 1)) / 2;
  const gy = ((home.y1 - home.y0) * (1 / minZoom - 1)) / 2;
  return {
    x0: home.x0 - gx,
    x1: home.x1 + gx,
    y0: home.y0 - gy,
    y1: home.y1 + gy,
  };
}

/**
 * Zoom by `factor` (>1 = in) keeping the data point under `focus`
 * stationary. The zoom level is measured against `home` (1 = fit),
 * capped at maxZoom; the floor falls out of `world` — the window can
 * grow no larger than the world it must stay inside.
 */
export function zoomRect(
  rect: Rect,
  home: Rect,
  focus: [number, number],
  factor: number,
  maxZoom: number,
  world = home,
): Rect {
  const minZoom = (home.x1 - home.x0) / (world.x1 - world.x0);
  const k = Math.min(Math.max(zoomOf(rect, home) * factor, minZoom), maxZoom);
  const w = (home.x1 - home.x0) / k;
  const h = (home.y1 - home.y0) / k;
  const [fx, fy] = focus;
  // Keep the focus point at the same relative position in the new rect
  const rx = (fx - rect.x0) / (rect.x1 - rect.x0);
  const ry = (fy - rect.y0) / (rect.y1 - rect.y0);
  return clampToHome(
    {
      x0: fx - rx * w,
      x1: fx + (1 - rx) * w,
      y0: fy - ry * h,
      y1: fy + (1 - ry) * h,
    },
    world,
  );
}

/** Pan by a data-space delta, clamped inside `bounds` (the camera
 * passes its world, so panning works at any zoom above the floor) */
export function panRect(
  rect: Rect,
  bounds: Rect,
  dx: number,
  dy: number,
): Rect {
  return clampToHome(
    { x0: rect.x0 + dx, x1: rect.x1 + dx, y0: rect.y0 + dy, y1: rect.y1 + dy },
    bounds,
  );
}

/**
 * Ray-casting point-in-polygon: shoot a horizontal ray from (x, y) to the
 * right and count edge crossings — odd = inside. Works for any simple
 * polygon, concave included.
 */
export function pointInPolygon(
  polygon: Polygon,
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Both hit-tests below replicate the vertex shader's projection on the
// CPU: clip = ViewProjection · (x, y, z, 1), then perspective divide and
// viewport mapping. `m` is the combined matrix in three.js column-major
// element order, so column c / row r lives at m[c * 4 + r] — e.g. row 3
// (producing clip.w) is m[3], m[7], m[11], m[15]. For an orthographic
// camera clip.w is 1 and the same code path applies.
//
// An optional `visible` mask (0/1 per point, the setVisible mask) excludes
// hidden points, matching the vertex shader's clip-out exactly.

/**
 * Indices of all points whose projection falls inside a screen-space
 * lasso polygon. A bbox pre-filter keeps the polygon test off most
 * points; w <= 0 (at or behind the camera) can never be inside.
 */
export function selectInPolygon(
  cols: Columns,
  m: ArrayLike<number>,
  width: number,
  height: number,
  polygon: Polygon,
  visible?: Uint8Array | null,
): number[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const { n, xs, ys, zs } = cols;
  const selected: number[] = [];
  for (let i = 0; i < n; i++) {
    if (visible && visible[i] === 0) continue;
    const x = xs[i];
    const y = ys[i];
    const z = zs[i];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) continue;
    const sx =
      (((m[0] * x + m[4] * y + m[8] * z + m[12]) / w) * 0.5 + 0.5) * width;
    // NDC y points up but screen y points down
    const sy =
      (0.5 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5) * height;
    if (
      sx >= minX &&
      sx <= maxX &&
      sy >= minY &&
      sy <= maxY &&
      pointInPolygon(polygon, sx, sy)
    ) {
      selected.push(i);
    }
  }
  return selected;
}

/**
 * The point nearest to (px, py) within radiusPx of the cursor, or null.
 * Linear scan on purpose: millions of points is single-digit ms and
 * hover hit-tests are debounced — no spatial index at this stage.
 * Nearest in screen distance only; with no depth buffer there is no
 * "topmost" point to prefer.
 */
export function nearestPoint(
  cols: Columns,
  m: ArrayLike<number>,
  width: number,
  height: number,
  px: number,
  py: number,
  radiusPx: number,
  visible?: Uint8Array | null,
): HoverHit | null {
  const { n, xs, ys, zs } = cols;
  let best = -1;
  let bestD = radiusPx * radiusPx;
  let bestX = 0;
  let bestY = 0;
  for (let i = 0; i < n; i++) {
    if (visible && visible[i] === 0) continue;
    const x = xs[i];
    const y = ys[i];
    const z = zs[i];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) continue;
    const sx =
      (((m[0] * x + m[4] * y + m[8] * z + m[12]) / w) * 0.5 + 0.5) * width;
    const sy =
      (0.5 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5) * height;
    const dx = sx - px;
    const dy = sy - py;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
      bestX = sx;
      bestY = sy;
    }
  }
  if (best < 0) return null;
  return {
    index: best,
    id: cols.ids[best],
    label: cols.labelKeys[cols.labelIndex[best]],
    x: bestX,
    y: bestY,
  };
}
