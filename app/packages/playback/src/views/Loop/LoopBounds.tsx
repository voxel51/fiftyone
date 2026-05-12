import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React, { useCallback } from "react";
import { loopEndAtom, loopStartAtom } from "../../lib/playback/atoms";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import { fmtBound, LOOP_EDGE_EPSILON } from "../TimelineControls/timeline-controls-utils";
import styles from "./LoopBounds.module.css";

/**
 * Loop start / end readouts. Renders nothing when the loop spans the full
 * timeline (default). Each bound is clickable to reset that side back to
 * its edge.
 *
 * Owns its own loop-atom subscriptions so the rest of the controls row
 * stays stable when the user drags loop handles.
 */
const LoopBounds: React.FC = () => {
  const loopStart = useAtomValue(loopStartAtom);
  const loopEnd = useAtomValue(loopEndAtom);
  const { duration, setLoop } = usePlayback();

  const hasLoop = duration !== undefined;
  const atStart = hasLoop && loopStart < LOOP_EDGE_EPSILON;
  const atEnd = hasLoop && loopEnd > duration - LOOP_EDGE_EPSILON;
  const loopMoved = hasLoop && (!atStart || !atEnd);

  const onLoopStartReset = useCallback(
    () => setLoop(0, loopEnd),
    [setLoop, loopEnd]
  );
  const onLoopEndReset = useCallback(
    () => setLoop(loopStart, duration),
    [setLoop, loopStart, duration]
  );

  if (!loopMoved) return null;

  return (
    <>
      <span className={styles.divider} aria-hidden />
      <span className={styles.loopBounds}>
        {"("}
        <Text
          variant={TextVariant.Xs}
          color={atStart ? TextColor.Muted : TextColor.Primary}
          className={styles.loopBound}
          onClick={onLoopStartReset}
          title="Reset loop start to 0"
          role="button"
        >
          {fmtBound(loopStart)}
        </Text>
        {" / "}
        <Text
          variant={TextVariant.Xs}
          color={atEnd ? TextColor.Muted : TextColor.Primary}
          className={styles.loopBound}
          onClick={onLoopEndReset}
          title="Reset loop end to duration"
          role="button"
        >
          {fmtBound(loopEnd)}
        </Text>
        {")"}
      </span>
    </>
  );
};

export default LoopBounds;
