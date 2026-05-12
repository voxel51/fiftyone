import { useAtomValue } from "jotai";
import React from "react";
import {
  loopEndAtom,
  loopStartAtom,
  viewEndAtom,
  viewStartAtom,
} from "../../lib/playback/atoms";
import styles from "./LoopOverlays.module.css";
import { clamp, laneLeftCalc } from "../utils/timeline-utils";

/** Tolerance for treating a loop bound as "at the edge" of the view. */
const LOOP_EDGE_EPSILON = 0.001;

export interface LoopOverlaysProps {
  /** Width of the label column shared between ruler and tracks. */
  labelWidth: number;
}

/**
 * Greyed-out overlays covering regions outside the active loop. Owns its
 * own subscriptions to the loop and view atoms; only renders the overlay
 * div(s) when the loop is actually narrower than the view.
 *
 * Must be rendered inside a positioned ancestor (any non-static `position`)
 * that spans the region the overlays should cover.
 */
const LoopOverlays: React.FC<LoopOverlaysProps> = ({ labelWidth }) => {
  const viewStart = useAtomValue(viewStartAtom);
  const viewEnd = useAtomValue(viewEndAtom);
  const loopStart = useAtomValue(loopStartAtom);
  const loopEnd = useAtomValue(loopEndAtom);

  const viewDuration = viewEnd - viewStart;
  const ratioFor = (t: number) =>
    viewDuration > 0 ? clamp((t - viewStart) / viewDuration, 0, 1) : 0;
  const laneLeft = (r: number) => laneLeftCalc(r, labelWidth);

  const showLeft = loopStart > viewStart + LOOP_EDGE_EPSILON;
  const showRight = loopEnd < viewEnd - LOOP_EDGE_EPSILON;

  return (
    <>
      {showLeft && (
        <div
          className={styles.mask}
          style={{
            left: laneLeft(0),
            width: `calc(${laneLeft(ratioFor(loopStart))} - ${laneLeft(0)})`,
          }}
        />
      )}
      {showRight && (
        <div
          className={styles.mask}
          style={{
            left: laneLeft(ratioFor(loopEnd)),
            right: 0,
          }}
        />
      )}
    </>
  );
};

export default LoopOverlays;
