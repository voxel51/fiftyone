/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/** What the loading box "detects", in the order it visits them. */
export interface Detection {
  /** VOODO chart color the box and its tag take */
  color: string;
  /** Characters of the text it covers, or a part of the label row */
  target: { text: string } | "all" | "dots";
}

const chart = (name: string) => `var(--color-content-viz-chart-${name})`;

// alternating sides and sizes, so each hop reads as a move; the first frames
// the whole word, as the box tracking its pixels did while it formed
export const DETECTIONS: Detection[] = [
  { color: "var(--color-brand-primary)", target: { text: "pixelating" } },
  { color: chart("teal"), target: { text: "pixel" } },
  { color: chart("magenta"), target: "dots" },
  { color: chart("purple"), target: { text: "elating" } },
  { color: chart("blue"), target: "all" },
  { color: chart("yellow"), target: { text: "ating" } },
];

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The box around part of a text node, relative to `origin`. */
export const textBox = (
  node: Text,
  start: number,
  end: number,
  origin: DOMRect,
): Box | undefined => {
  if (typeof document.createRange !== "function") return undefined;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const rect = range.getBoundingClientRect?.();
  return rect && rect.width ? relative(rect, origin) : undefined;
};

export const relative = (rect: DOMRect, origin: DOMRect): Box => ({
  left: rect.left - origin.left,
  top: rect.top - origin.top,
  width: rect.width,
  height: rect.height,
});

/**
 * Where a single line of text in `ctx`'s font sits within a box `height`
 * tall: the line box centers the font's ascent and descent
 */
export const baseline = (ctx: CanvasRenderingContext2D, height: number) => {
  const font = ctx.measureText("M");
  const ascent = font.fontBoundingBoxAscent ?? font.actualBoundingBoxAscent;
  const descent = font.fontBoundingBoxDescent ?? font.actualBoundingBoxDescent;
  return (height - ascent - descent) / 2 + ascent;
};
