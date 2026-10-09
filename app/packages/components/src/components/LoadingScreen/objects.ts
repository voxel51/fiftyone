/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/** What the loading box "detects", in the order it visits them. */
export interface Detection {
  label: string;
  /** Always a variation of 51 */
  score: string;
  /** VOODO chart color the box and its tag take */
  color: string;
  /** Characters of the text it covers, or a part of the label row */
  target: { text: string } | "all" | "dots" | "cursor";
}

const chart = (name: string) => `var(--color-content-viz-chart-${name})`;

export const DETECTIONS: Detection[] = [
  { label: "loading", score: "0.951", color: chart("blue"), target: "all" },
  {
    label: "pixel",
    score: 0.98,
    color: chart("teal"),
    target: { text: "pixel" },
  },
  {
    label: "suffix",
    score: 0.84,
    color: chart("yellow"),
    target: { text: "ating" },
  },
  {
    label: "ellipsis",
    score: "0.515",
    color: chart("magenta"),
    target: "dots",
  },
  { label: "cursor", score: "0.51", color: chart("red"), target: "cursor" },
  {
    label: "mood",
    score: 0.51,
    color: chart("purple"),
    target: { text: "elating" },
  },
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
