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
export const DWELL_MS = 800;

interface Parts {
  label: RefObject<HTMLElement>;
  word: RefObject<HTMLElement>;
  dots: RefObject<HTMLElement>;
  cursor: RefObject<HTMLElement>;
}

const measure = (detection: Detection, parts: Parts): Box | undefined => {
  const label = parts.label.current;
  if (!label) return undefined;
  const origin = label.getBoundingClientRect();
  const { target } = detection;
  if (target === "all") return relative(origin, origin);
  if (target === "dots" || target === "cursor") {
    const el = parts[target].current;
    return el ? relative(el.getBoundingClientRect(), origin) : undefined;
  }
  const node = parts.word.current?.firstChild;
  const text = node?.textContent ?? "";
  const start = text.toLowerCase().indexOf(target.text);
  if (!(node instanceof Text) || start < 0) return undefined;
  return textBox(node, start, start + target.text.length, origin);
};

/**
 * Cycles a detection box over the label's parts, skipping any the text does
 * not contain. Returns the detection shown and where its box sits.
 */
export default function useDetections(parts: Parts, still: boolean) {
  const [boxes, setBoxes] = useState<[Detection, Box][]>([]);
  const [index, setIndex] = useState(0);

  useLayoutEffect(() => {
    const update = () =>
      setBoxes(
        DETECTIONS.flatMap((detection) => {
          const box = measure(detection, parts);
          return box ? [[detection, box] as [Detection, Box]] : [];
        }),
      );
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
