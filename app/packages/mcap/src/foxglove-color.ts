import type { FoxgloveColor } from "./foxglove-protobuf";

function clampUnit(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, Number(value)));
}

function toByte(value: number | null | undefined) {
  return Math.round(clampUnit(value) * 255);
}

export function foxgloveColorToCss(
  color: FoxgloveColor | null | undefined,
  fallback = "rgba(255,255,255,1)"
) {
  if (!color) {
    return fallback;
  }

  return `rgba(${toByte(color.r)}, ${toByte(color.g)}, ${toByte(
    color.b
  )}, ${clampUnit(color.a ?? 1)})`;
}

export function foxgloveColorToRgbaArray(
  color: FoxgloveColor | null | undefined
) {
  return [
    clampUnit(color?.r),
    clampUnit(color?.g),
    clampUnit(color?.b),
    clampUnit(color?.a ?? 1),
  ] as const;
}
