/**
 * Canvas-rendered position "pucks" for the map tile. MapLibre circle
 * layers cannot render gradients, so the dimensional look — dome shading,
 * specular highlight, white rim, baked drop shadow — is pre-drawn once per
 * track color and registered as a symbol icon, the technique behind
 * Google/Uber-style navigation markers. The nav variant is a teardrop
 * drawn pointing north; `icon-rotate` supplies the bearing.
 */

export const PUCK_VARIANT = {
  /** Plain dome, used when no heading is derivable. */
  DOT: "dot",
  /** North-pointing teardrop, rotated to the GPS segment bearing. */
  NAV: "nav",
} as const;

export type PuckVariant = (typeof PUCK_VARIANT)[keyof typeof PUCK_VARIANT];

/** CSS size of the rendered sprite; drawn at 2x for retina. */
const PUCK_SIZE_PX = 40;
const PUCK_PIXEL_RATIO = 2;
const PUCK_RADIUS_PX = 9;

const VOXEL51_PRIMARY_FALLBACK = "#ff6d04";
const VOXEL51_PRIMARY_CSS_VAR = "--fo-palette-primary-plainColor";

let cachedPrimaryColor: string | null = null;

/**
 * The app's primary (Voxel51 orange) resolved from the theme's CSS
 * variable, with a literal fallback for standalone/test environments.
 * MapLibre paint values cannot reference CSS variables, so this is
 * resolved once and handed over as a concrete color.
 */
export function voxel51PrimaryColor(): string {
  if (cachedPrimaryColor) {
    return cachedPrimaryColor;
  }
  if (typeof document === "undefined") {
    return VOXEL51_PRIMARY_FALLBACK;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(VOXEL51_PRIMARY_CSS_VAR)
    .trim();
  // The theme emits hsl() strings; the sprite/gradient math needs hex, so
  // normalize through canvas (which serializes opaque colors as #rrggbb).
  cachedPrimaryColor =
    value.length > 0
      ? (normalizeCssColorToHex(value) ?? VOXEL51_PRIMARY_FALLBACK)
      : VOXEL51_PRIMARY_FALLBACK;
  return cachedPrimaryColor;
}

function normalizeCssColorToHex(color: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = color;
  const normalized = ctx.fillStyle;
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : null;
}

export function puckImageId(variant: PuckVariant, color: string): string {
  return `episode-puck-${variant}-${color}`;
}

/** The subset of the MapLibre map surface the sprite registry needs. */
export interface PuckImageHost {
  hasImage(id: string): boolean;
  addImage(
    id: string,
    image: ImageData,
    options?: { pixelRatio?: number },
  ): void;
}

/**
 * Registers both puck variants for each track color, skipping ids the map
 * already has. A no-op where 2D canvas is unavailable (e.g. jsdom) — the
 * symbol layer simply renders nothing rather than erroring.
 */
export function ensurePuckImages(
  map: PuckImageHost,
  colors: readonly string[],
): void {
  for (const color of new Set(colors)) {
    for (const variant of Object.values(PUCK_VARIANT)) {
      const id = puckImageId(variant, color);
      if (map.hasImage(id)) {
        continue;
      }
      const image = drawPuckImage(variant, color);
      if (image) {
        map.addImage(id, image, { pixelRatio: PUCK_PIXEL_RATIO });
      }
    }
  }
}

function drawPuckImage(variant: PuckVariant, color: string): ImageData | null {
  // Partial canvas implementations (jsdom, test stubs) surface as thrown
  // TypeErrors mid-draw; a puck that cannot draw degrades to no icon.
  try {
    return drawPuckImageUnsafe(variant, color);
  } catch {
    return null;
  }
}

function drawPuckImageUnsafe(
  variant: PuckVariant,
  color: string,
): ImageData | null {
  if (typeof document === "undefined") {
    return null;
  }
  const size = PUCK_SIZE_PX * PUCK_PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const center = size / 2;
  const radius = PUCK_RADIUS_PX * PUCK_PIXEL_RATIO;

  // Baked drop shadow: a soft dark ellipse slightly below the dome.
  const shadow = ctx.createRadialGradient(
    center,
    center + radius * 0.5,
    radius * 0.2,
    center,
    center + radius * 0.5,
    radius * 1.5,
  );
  shadow.addColorStop(0, "rgba(2, 8, 16, 0.4)");
  shadow.addColorStop(1, "rgba(2, 8, 16, 0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(
    center,
    center + radius * 0.5,
    radius * 1.5,
    radius * 1.1,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  tracePuckPath(ctx, variant, center, radius);

  // White rim first (stroked under the fill so half its width shows),
  // then the gradient dome.
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3 * PUCK_PIXEL_RATIO;
  ctx.lineJoin = "round";
  ctx.stroke();

  const dome = ctx.createRadialGradient(
    center - radius * 0.45,
    center - radius * 0.55,
    radius * 0.15,
    center,
    center,
    radius * 2.1,
  );
  dome.addColorStop(0, mixHexColor(color, "#ffffff", 0.45));
  dome.addColorStop(0.45, color);
  dome.addColorStop(1, mixHexColor(color, "#000000", 0.35));
  ctx.fillStyle = dome;
  ctx.fill();

  // Specular highlight off toward the light source.
  const specular = ctx.createRadialGradient(
    center - radius * 0.4,
    center - radius * 0.5,
    0,
    center - radius * 0.4,
    center - radius * 0.5,
    radius * 0.8,
  );
  specular.addColorStop(0, "rgba(255, 255, 255, 0.55)");
  specular.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = specular;
  ctx.beginPath();
  ctx.arc(
    center - radius * 0.3,
    center - radius * 0.4,
    radius * 0.7,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

function tracePuckPath(
  ctx: CanvasRenderingContext2D,
  variant: PuckVariant,
  center: number,
  radius: number,
) {
  ctx.beginPath();
  if (variant === PUCK_VARIANT.DOT) {
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    return;
  }
  // Teardrop pointing north (up): nose tip, left shoulder, around the
  // bottom of the circle, right shoulder back to the tip.
  const tipY = center - radius * 2;
  ctx.moveTo(center, tipY);
  ctx.quadraticCurveTo(
    center - radius * 0.95,
    center - radius * 0.75,
    center - radius,
    center,
  );
  ctx.arc(center, center, radius, Math.PI, 0, true);
  ctx.quadraticCurveTo(
    center + radius * 0.95,
    center - radius * 0.75,
    center,
    tipY,
  );
  ctx.closePath();
}

/** `color` with `alpha` applied, for gradient endpoints. */
export function hexColorWithAlpha(color: string, alpha: number): string {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return color;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function mixHexColor(color: string, target: string, amount: number): string {
  const from = parseHexColor(color);
  const to = parseHexColor(target);
  if (!from || !to) {
    return color;
  }
  const mixed = from.map((channel, index) =>
    Math.round(channel + (to[index] - channel) * amount),
  );
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function parseHexColor(
  color: string,
): readonly [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
