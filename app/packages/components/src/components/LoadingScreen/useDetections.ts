/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type RefObject, useEffect, useLayoutEffect, useState } from "react";
import {
  type Box,
  DETECTIONS,
  type Detection,
  relative,
  textBox,
} from "./objects";

/** How long the box rests on each object */
export const DWELL_MS = 1000;
/** Room around each object, so a box frames it rather than touching it */
const PAD = 4;

interface Parts {
  label: RefObject<HTMLElement>;
  word: RefObject<HTMLElement>;
  dots: RefObject<HTMLElement>;
}

const pad = (box: Box): Box => ({
  left: box.left - PAD,
  top: box.top - PAD,
  width: box.width + PAD * 2,
  height: box.height + PAD * 2,
});

const union = (boxes: Box[]): Box => {
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
};

let ruler: CanvasRenderingContext2D | null | undefined;

/**
 * The ink of part of the word: its span from the text layout, and its
 * glyphs' real top and bottom measured on a canvas, set on the baseline
 */
const ink = (
  word: HTMLElement,
  start: number,
  end: number,
  origin: DOMRect,
) => {
  const node = word.firstChild;
  if (!(node instanceof Text)) return undefined;
  const span = textBox(node, start, end, origin);
  if (!span) return undefined;
  ruler ??= document.createElement("canvas").getContext?.("2d");
  if (!ruler) return span;
  ruler.font = getComputedStyle(word).font;
  const glyphs = ruler.measureText((node.textContent ?? "").slice(start, end));
  const font = ruler.measureText("M");
  // a single line centers the font's box in the line box
  const ascent = font.fontBoundingBoxAscent ?? glyphs.actualBoundingBoxAscent;
  const descent =
    font.fontBoundingBoxDescent ?? glyphs.actualBoundingBoxDescent;
  const baseline = span.top + (span.height - ascent - descent) / 2 + ascent;
  return {
    left: span.left,
    width: span.width,
    top: baseline - glyphs.actualBoundingBoxAscent,
    height: glyphs.actualBoundingBoxAscent + glyphs.actualBoundingBoxDescent,
  };
};

const find = (detection: Detection, parts: Parts): Box | undefined => {
  const label = parts.label.current;
  const word = parts.word.current;
  if (!label || !word) return undefined;
  const origin = label.getBoundingClientRect();
  const text = (word.textContent ?? "").toLowerCase();
  const dots = parts.dots.current;
  const marks = dots
    ? relative(dots.getBoundingClientRect(), origin)
    : undefined;
  const { target } = detection;
  if (target === "dots") return marks;
  if (target === "all") {
    const found = [ink(word, 0, text.length, origin), marks].filter(
      (box): box is Box => Boolean(box),
    );
    return found.length ? union(found) : relative(origin, origin);
  }
  const start = text.indexOf(target.text);
  return start < 0
    ? undefined
    : ink(word, start, start + target.text.length, origin);
};

/** Where each detection's box goes, once measured */
export const locate = (parts: Parts): [Detection, Box][] =>
  DETECTIONS.flatMap((detection) => {
    const box = find(detection, parts);
    return box ? [[detection, pad(box)] as [Detection, Box]] : [];
  });

/**
 * Cycles a detection box over the label's parts, skipping any the text does
 * not contain. Returns the detection shown and where its box sits.
 */
export default function useDetections(parts: Parts, still: boolean) {
  const [boxes, setBoxes] = useState<[Detection, Box][]>([]);
  const [index, setIndex] = useState(0);

  useLayoutEffect(() => {
    const update = () => setBoxes(locate(parts));
    update();
    const label = parts.label.current;
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    label && observer?.observe(label);
    document.fonts?.ready.then(update).catch(() => undefined);
    return () => observer?.disconnect();
    // the parts are refs, read when measuring
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (still || boxes.length < 2) return undefined;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % boxes.length),
      DWELL_MS,
    );
    return () => clearInterval(timer);
  }, [boxes.length, still]);

  return boxes[index % Math.max(boxes.length, 1)];
}
