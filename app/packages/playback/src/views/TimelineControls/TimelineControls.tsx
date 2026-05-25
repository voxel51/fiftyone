import { Button, IconName, Size, Variant } from "@voxel51/voodo";
import clsx from "clsx";
import React from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import { useIsPlaying } from "../../lib/playback/use-playback-state";
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
}

const TimelineControls: React.FC<TimelineControlsProps> = ({ onToggle }) => {
  const isPlaying = useIsPlaying();
  const { play, pause, stepBack, stepForward } = usePlayback();

  const handleClick = onToggle
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const interactive = target.closest(
          'button, [role="button"], a, input, select, textarea'
        );
        if (interactive && interactive !== e.currentTarget) return;
        onToggle();
      }
    : undefined;

  const handleKeyDown = onToggle
    ? (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Only respond if focus is on the row itself, not a nested control.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }
    : undefined;

  return (
    <div
      className={clsx(styles.root, { [styles.clickable]: !!onToggle })}
      data-testid="timeline-controls-root"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
    >
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="timeline-controls-step-back"
        leadingIcon={IconName.ChevronLeft}
        aria-label="Step back"
        onClick={stepBack}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="timeline-controls-play-pause"
        leadingIcon={isPlaying ? PauseIcon : PlayIcon}
        aria-label={isPlaying ? "Pause" : "Play"}
        aria-pressed={isPlaying}
        onClick={isPlaying ? pause : play}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="timeline-controls-step-forward"
        leadingIcon={IconName.ChevronRight}
        aria-label="Step forward"
        onClick={stepForward}
      />

      <span
        className={styles.divider}
        data-testid="timeline-controls-divider"
        aria-hidden
      />
      <PlayheadTime />
      <LoopBounds />
    </div>
  );
};

export default TimelineControls;
