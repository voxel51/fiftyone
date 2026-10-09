/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Align, Justify, Stack } from "@voxel51/voodo";
import { type CSSProperties, useRef } from "react";

import styles from "./LoadingScreen.module.css";
import useDetections from "./useDetections";
import usePixelAssembly from "./usePixelAssembly";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * A region that is still filling: the whole area, with what it is waiting on
 * centered in it. The text forms from pixels while a detection box moves
 * over its parts. Every wait that blanks a region renders this, so a second
 * one appearing reads as the same screen rather than a new one.
 */
export default function LoadingScreen({ text }: { text: string }) {
  const still = useRef(reducedMotion()).current;
  const label = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const dots = useRef<HTMLSpanElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const { assembled, scatter } = usePixelAssembly(canvas, word, still);
  const detection = useDetections({ label, word, dots, cursor }, !assembled);

  return (
    <Stack
      align={Align.Center}
      justify={Justify.Center}
      className={styles.screen}
    >
      <div ref={label} className={styles.label} role="status" aria-label={text}>
        <span className={styles.word}>
          <span ref={word} style={{ opacity: assembled ? 1 : 0 }}>
            {text.toLowerCase()}
          </span>
          {!assembled && (
            <canvas
              ref={canvas}
              aria-hidden
              className={styles.pixels}
              style={{ left: -scatter, top: -scatter }}
            />
          )}
        </span>
        <span ref={dots} className={styles.dots} aria-hidden>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
        <span ref={cursor} className={styles.cursor} aria-hidden />
        {assembled && detection && (
          <div
            aria-hidden
            data-cy="loading-detection"
            className={styles.box}
            style={
              {
                transform: `translate(${detection[1].left}px, ${detection[1].top}px)`,
                width: detection[1].width,
                height: detection[1].height,
                "--detection": detection[0].color,
              } as CSSProperties
            }
          >
            <span className={styles.tag}>
              {detection[0].label} {detection[0].score}
            </span>
          </div>
        )}
      </div>
    </Stack>
  );
}
