/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Align, Justify, Stack } from "@voxel51/voodo";
import { type CSSProperties, useRef } from "react";

import styles from "./LoadingScreen.module.css";
import { type Box, DETECTIONS } from "./objects";
import useDetections, { DWELL_MS, pad } from "./useDetections";
import usePixelAssembly from "./usePixelAssembly";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * A region that is still filling: the pixels of what it is waiting on gather
 * into its name, then detection boxes blink on over its parts. Every
 * wait that blanks a region renders this, so a second one appearing reads as
 * the same screen rather than a new one.
 */
export default function LoadingScreen({ text }: { text: string }) {
  const still = useRef(reducedMotion()).current;
  const label = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const dots = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const offset = useRef<{ x: number; y: number }>();
  // while the word forms, the box locks onto its pixels as they gather
  const track = (bounds: Box) => {
    const el = box.current;
    if (!el) return;
    if (!offset.current) {
      const into = label.current?.getBoundingClientRect();
      const from = word.current?.getBoundingClientRect();
      if (!into || !from) return;
      offset.current = { x: from.left - into.left, y: from.top - into.top };
    }
    const at = pad(bounds);
    el.style.transform = `translate(${offset.current.x + at.left}px, ${
      offset.current.y + at.top
    }px)`;
    el.style.width = `${at.width}px`;
    el.style.height = `${at.height}px`;
    el.style.opacity = "1";
  };
  const { assembled } = usePixelAssembly(canvas, word, still, track);
  const detection = useDetections({ label, word, dots }, still || !assembled);
  const [target, at] = assembled && detection ? detection : [DETECTIONS[0]];

  return (
    <div className={styles.screen}>
      {!still && (
        <canvas
          ref={canvas}
          aria-hidden
          className={styles.pixels}
          style={{ opacity: assembled ? 0 : 1 }}
        />
      )}
      <Stack
        align={Align.Center}
        justify={Justify.Center}
        className={styles.fill}
      >
        <div
          ref={label}
          className={styles.label}
          role="status"
          aria-label={text}
        >
          <span
            ref={word}
            // on at once, over the canvas's identical text as it fades
            style={{ opacity: assembled ? 1 : 0 }}
          >
            {text.toLowerCase()}
          </span>
          <span
            ref={dots}
            className={styles.dots}
            style={{ opacity: assembled ? 1 : 0 }}
            aria-hidden
          >
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </span>
          <div
            // each detection is its own box, blinking on where it is found
            key={assembled ? DETECTIONS.indexOf(target) : "forming"}
            ref={box}
            aria-hidden
            data-cy="loading-detection"
            className={`${styles.box} ${
              assembled ? styles.blink : styles.tracking
            }`}
            style={
              {
                ...(at && {
                  transform: `translate(${at.left}px, ${at.top}px)`,
                  width: at.width,
                  height: at.height,
                }),
                "--detection": target.color,
                "--dwell": `${DWELL_MS}ms`,
              } as CSSProperties
            }
          />
        </div>
      </Stack>
    </div>
  );
}
