import {
  KnownCommands,
  KnownContexts,
  useKeyBindings,
} from "@fiftyone/commands";
import {
  Align,
  Anchor,
  Button,
  IconName,
  Justify,
  Orientation,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "../stableIcons";
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
  useBufferingStreams,
  useIsBuffering,
  useIsPlayPending,
  useIsPlaying,
} from "../../lib/playback/use-playback-state";
import type { BufferingStream } from "../../lib/playback/types";
import LoopBounds from "../Loop/LoopBounds";
import PlayheadTime from "../Playhead/PlayheadTime";
import SpeedControl from "./SpeedControl";
import VolumeControl from "./VolumeControl";
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
   * Optional content rendered inline after the playhead time / loop bounds,
   * preceded by its own divider — still part of the left-hand run of
   * controls. Readouts belong here (the multimodal surface's absolute
   * timestamp, the temporal tag-mode button). For buttons that should sit
   * against the right edge instead, use {@link trailingActions}.
   */
  extraActions?: ReactNode;
  /**
   * Optional buttons pinned to the right edge of the row, preceded by their
   * own divider and followed by the drawer chevron. Unlike
   * {@link extraActions} these never mingle with the time readouts — this is
   * the bring-your-own-buttons slot.
   */
  trailingActions?: ReactNode;
  /**
   * Current open state of the surface {@link onToggle} controls. Drives the
   * trailing chevron's rotation, so it only matters when `onToggle` is set.
   */
  expanded?: boolean;
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
  onToggle,
  extraControls,
  extraActions,
  trailingActions,
  expanded = false,
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

  return (
    // Deliberately not focusable and not `role="button"`. As a tab stop the
    // row drew a focus ring around the whole bar, which read as everything
    // lighting up rather than one control being selected. Keyboard access to
    // the drawer lives on the trailing chevron — a real button, which takes
    // Enter/Space natively — so nothing is lost by dropping the tab stop.
    // Click-anywhere-to-toggle still works for pointer users.
    <div
      className={clsx(styles.root, { [styles.clickable]: !!onToggle })}
      data-testid="timeline-controls-root"
      onClick={handleClick}
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
      <VolumeControl />

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
      {(trailingActions || onToggle) && (
        <div className={styles.trailing}>
          {trailingActions ? (
            <>
              <span
                className={styles.divider}
                data-testid="timeline-controls-divider"
                aria-hidden
              />
              <div
                className={styles.trailingActions}
                data-testid="timeline-controls-trailing-actions"
              >
                {trailingActions}
              </div>
            </>
          ) : null}
          {onToggle ? (
            <Button
              variant={Variant.Icon}
              size={Size.Xs}
              data-testid="timeline-controls-toggle"
              leadingIcon={IconName.ChevronBottom}
              aria-label={expanded ? "Hide tracks" : "Show tracks"}
              aria-expanded={expanded}
              className={clsx(styles.toggle, {
                [styles.toggleExpanded]: expanded,
              })}
              // The row's own click handler ignores clicks that land on a
              // button, so the chevron must drive the toggle itself.
              onClick={onToggle}
            />
          ) : null}
        </div>
      )}
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
  const streams = useBufferingStreams();

  if (!isBuffering && !isPlayPending) return null;

  const indicator = (
    <span
      className={styles.buffering}
      data-testid="timeline-controls-buffering"
      role="status"
    >
      <Spinner size={Size.Xs} />
      {detail ? `Buffering ${detail}` : "Buffering"}
    </span>
  );

  if (streams.length === 0) return indicator;

  return (
    <Tooltip
      anchor={Anchor.Top}
      className={styles.bufferingTooltip}
      content={<BufferingStreamDetails streams={streams} />}
      portal
      wrapperClassName={styles.bufferingTooltipTrigger}
    >
      {indicator}
    </Tooltip>
  );
}

function BufferingStreamDetails({
  streams,
}: {
  readonly streams: readonly BufferingStream[];
}) {
  const waiting = streams.filter((stream) => stream.state === "waiting");
  const ready = streams.filter((stream) => stream.state === "ready");

  return (
    <Stack
      className={styles.bufferingDetails}
      orientation={Orientation.Column}
      spacing={Spacing.Sm}
    >
      <Stack
        align={Align.Center}
        justify={Justify.Between}
        orientation={Orientation.Row}
        spacing={Spacing.Lg}
      >
        <Text color={TextColor.Primary} variant={TextVariant.Label}>
          Playback streams
        </Text>
        <Text
          className={styles.bufferingSummary}
          color={TextColor.Secondary}
          variant={TextVariant.Caption}
        >
          {waiting.length} waiting · {ready.length} ready
        </Text>
      </Stack>
      <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
        {[...waiting, ...ready].map((stream) => (
          <Stack
            align={Align.Center}
            className={styles.bufferingStreamRow}
            justify={Justify.Between}
            key={stream.id}
            orientation={Orientation.Row}
            spacing={Spacing.Lg}
          >
            <Text
              className={styles.bufferingStreamName}
              color={TextColor.Primary}
              title={stream.label}
              variant={TextVariant.Xs}
            >
              {stream.label}
            </Text>
            <Text
              className={styles.bufferingStreamState}
              color={
                stream.state === "waiting"
                  ? TextColor.Warning
                  : TextColor.Success
              }
              variant={TextVariant.Caption}
            >
              {stream.state === "waiting" ? "Waiting" : "Ready"}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

export default TimelineControls;
