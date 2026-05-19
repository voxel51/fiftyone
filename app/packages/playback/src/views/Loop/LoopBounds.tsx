import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useCallback } from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import { useLoopEnd, useLoopStart } from "../../lib/playback/use-playback-state";
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
  const loopStart = useLoopStart();
  const loopEnd = useLoopEnd();
  const { duration, setLoop } = usePlayback();

  const hasLoop = duration !== undefined;
  const atStart = hasLoop && loopStart < LOOP_EDGE_EPSILON;
  const atEnd = hasLoop && loopEnd > duration - LOOP_EDGE_EPSILON;
  const loopMoved = hasLoop && (!atStart || !atEnd);

  // setLoop is a stable jotai-backed action — not in deps by design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onLoopStartReset = useCallback(() => setLoop(0, loopEnd), [loopEnd]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onLoopEndReset = useCallback(
    () => setLoop(loopStart, duration),
    [loopStart, duration]
  );

  const activateOnEnter =
    (callback: () => void) => (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        callback();
      }
    };

  if (!loopMoved) return null;

  return (
    <>
      <span className={styles.divider} aria-hidden />
      <span className={styles.loopBounds}>
        <Text
          variant={TextVariant.Xs}
          color={TextColor.Muted}
        >
          {" ( "}
        </Text>
        <Text
          variant={TextVariant.Xs}
          color={atStart ? TextColor.Muted : TextColor.Primary}
          className={styles.loopBound}
          onClick={onLoopStartReset}
          onKeyDown={activateOnEnter(onLoopStartReset)}
          tabIndex={0}
          title="Reset loop start to 0"
          role="button"
        >
          {fmtBound(loopStart)}
        </Text>
        <Text
          variant={TextVariant.Xs}
          color={TextColor.Muted}
        >
          {" / "}
        </Text>
        <Text
          variant={TextVariant.Xs}
          color={atEnd ? TextColor.Muted : TextColor.Primary}
          className={styles.loopBound}
          onClick={onLoopEndReset}
          onKeyDown={activateOnEnter(onLoopEndReset)}
          tabIndex={0}
          title="Reset loop end to duration"
          role="button"
        >
          {fmtBound(loopEnd)}
        </Text>
        <Text
          variant={TextVariant.Xs}
          color={TextColor.Muted}
        >
          {" ) "}
        </Text>
      </span>
    </>
  );
};

export default LoopBounds;
