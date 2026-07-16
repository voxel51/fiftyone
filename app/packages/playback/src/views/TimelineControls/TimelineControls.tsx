import {
  KnownCommands,
  KnownContexts,
  useKeyBindings,
} from "@fiftyone/commands";
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Size,
  Spinner,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import React, { type ReactNode } from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import {
  getIsPlayPending,
  getIsPlaying,
} from "../../lib/playback/store-access";
import {
  useBufferingDetail,
  useIsBuffering,
  useIsPlayPending,
  useIsPlaying,
} from "../../lib/playback/use-playback-state";
import LoopBounds from "../Loop/LoopBounds";
import PlayheadTime from "../Playhead/PlayheadTime";
import SpeedControl from "./SpeedControl";
import { PauseIcon, PlayIcon } from "./timeline-controls-icons";
import styles from "./TimelineControls.module.css";

export interface TimelineControlsProps {
  /**
   * Optional handler invoked when the user clicks the row outside any
   * interactive control. Wire this to the parent's drawer toggle so the row
   * acts as a "show / hide tracks" affordance.
   */
  onToggle?: () => void;
  /**
   * Optional content rendered inline between the playback control buttons and
   * the playhead time display, with no divider. Feature toolbars slot here —
   * e.g. the video annotation surface's Mark Keyframe / Propagate actions.
   */
  extraControls?: ReactNode;
  /**
   * Optional content rendered far-right, after the playhead time / loop
   * bounds, preceded by its own divider. Use for trailing actions that read
   * as a separate group — e.g. the temporal tag-mode button.
   */
  extraActions?: ReactNode;
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
  onToggle,
  extraControls,
  extraActions,
}) => {
  const isPlaying = useIsPlaying();
  const isPlayPending = useIsPlayPending();
  const hasPlayIntent = isPlaying || isPlayPending;
  const { play, pause, stepBack, stepForward } = usePlayback();
  const store = usePlaybackStore();

  useKeyBindings(KnownContexts.Modal, [
    {
      commandId: KnownCommands.ModalPlayPause,
      // Bare Space only — the key matcher requires an exact modifier
      // state, so shift+space / meta+space etc. fall through untouched.
      // On a match the command manager calls preventDefault, which also
      // suppresses native space-activation of a focused button/checkbox.
      sequence: "space",
      // Read isPlaying from the store, not the render closure — the
      // command must observe the engine's current state even if a
      // re-render hasn't committed yet.
      handler: () =>
        getIsPlaying(store) || getIsPlayPending(store) ? pause() : play(),
      label: "Play / Pause",
      description: "Toggle playback",
    },
    {
      commandId: KnownCommands.ModalStepForward,
      // "." advances a single frame.
      sequence: ".",
      handler: stepForward,
      label: "Step forward",
      description: "Advance one frame",
    },
    {
      commandId: KnownCommands.ModalStepBack,
      // "," steps back a single frame ("\\," escapes the reserved delimiter).
      sequence: "\\,",
      handler: stepBack,
      label: "Step back",
      description: "Go back one frame",
    },
  ]);

  const handleClick = onToggle
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const interactive = target.closest(
          'button, [role="button"], a, input, select, textarea',
        );
        if (interactive && interactive !== e.currentTarget) return;
        onToggle();
      }
    : undefined;

  const handleKeyDown = onToggle
    ? (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Only respond if focus is on the row itself, not a nested control.
        if (e.target !== e.currentTarget) return;
        // Enter only — Space is reserved for the global play/pause
        // shortcut and must never expand/collapse the tracks drawer.
        if (e.key === "Enter") {
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
        leadingIcon={ChevronLeftIcon}
        aria-label="Step back"
        onClick={stepBack}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="timeline-controls-play-pause"
        leadingIcon={hasPlayIntent ? PauseIcon : PlayIcon}
        aria-label={hasPlayIntent ? "Pause" : "Play"}
        aria-pressed={hasPlayIntent}
        onClick={hasPlayIntent ? pause : play}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="timeline-controls-step-forward"
        leadingIcon={ChevronRightIcon}
        aria-label="Step forward"
        onClick={stepForward}
      />
      <SpeedControl />

      {extraControls}

      <span
        className={styles.divider}
        data-testid="timeline-controls-divider"
        aria-hidden
      />
      <PlayheadTime />
      <LoopBounds />
      <BufferingIndicator />
      {extraActions ? (
        <>
          <span
            className={styles.divider}
            data-testid="timeline-controls-divider"
            aria-hidden
          />
          {extraActions}
        </>
      ) : null}
    </div>
  );
};

/**
 * Subtle "catching up" pill shown while the engine waits on stream data —
 * both mid-playback stalls and paused seeks/steps into unbuffered regions.
 * Streams can sharpen the message via `setBufferingDetail` (e.g. "3/7
 * streams").
 */
function BufferingIndicator() {
  const isBuffering = useIsBuffering();
  const isPlayPending = useIsPlayPending();
  const detail = useBufferingDetail();

  if (!isBuffering && !isPlayPending) return null;

  return (
    <span
      className={styles.buffering}
      data-testid="timeline-controls-buffering"
      role="status"
    >
      <Spinner size={Size.Xs} />
      {detail ? `Buffering ${detail}` : "Buffering"}
    </span>
  );
}

export default TimelineControls;
