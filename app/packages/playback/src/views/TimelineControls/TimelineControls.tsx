import { Button, IconName, Size, Variant } from "@voxel51/voodo";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import React from "react";
import { isPlayingAtom } from "../../lib/playback-atoms";
import { usePlayback } from "../../lib/PlaybackProvider";
import LoopBounds from "../Loop/LoopBounds";
import PlayheadTime from "../Playhead/PlayheadTime";
import { PauseIcon, PlayIcon } from "./timeline-controls-icons";
import styles from "./TimelineControls.module.css";

export interface TimelineControlsProps {
  /**
   * Optional handler invoked when the user clicks the row outside any
   * interactive control. Wire this to the parent's drawer toggle so the row
   * acts as a "show / hide tracks" affordance.
   */
  onToggle?: () => void;
  className?: string;
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
  onToggle,
  className,
}) => {
  const isPlaying = useAtomValue(isPlayingAtom);
  const { play, pause, stepBack, stepForward } = usePlayback();

  const handleClick = onToggle
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        // Skip clicks on real interactive elements — they own their own action.
        if (target.closest('button, [role="button"]')) return;
        onToggle();
      }
    : undefined;

  return (
    <div
      className={clsx(styles.root, { [styles.clickable]: !!onToggle }, className)}
      onClick={handleClick}
    >
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        leadingIcon={IconName.ChevronLeft}
        aria-label="Step back"
        onClick={stepBack}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        leadingIcon={isPlaying ? PauseIcon : PlayIcon}
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={isPlaying ? pause : play}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        leadingIcon={IconName.ChevronRight}
        aria-label="Step forward"
        onClick={stepForward}
      />

      <span className={styles.divider} aria-hidden />
      <PlayheadTime />
      <LoopBounds />
    </div>
  );
};

export default TimelineControls;
