import { Anchor, Text, TextColor, TextVariant, Tooltip } from "@voxel51/voodo";
import React from "react";
import {
  usePlayback,
  useTimelineModeControl,
} from "../../lib/playback/PlaybackProvider";
import { useTimelineDisplay } from "../../lib/playback/timeline-display";
import { usePlayhead } from "../../lib/playback/use-playback-state";
import { formatDisplayValue } from "../TimelineControls/timeline-controls-utils";
import styles from "../TimelineControls/TimelineControls.module.css";

/** What clicking the readout switches to, given what it's showing now. */
function toggleHint(showing: string, switchingTo: string): string {
  return `Showing ${showing} — click to switch to ${switchingTo}`;
}

/**
 * Live playhead time readout, displayed as `currentTime / duration`.
 * Isolated into its own component so consumers don't re-render on every
 * RAF tick just because the time changes.
 *
 * When the timeline was configured with a domain of its own — frame numbers
 * from a known frame rate, or wall-clock timestamps from an epoch anchor —
 * the readout is a button that swaps the whole timeline's display between
 * that domain and plain elapsed time. Only the presentation changes; the
 * engine keeps stepping in frames either way.
 */
const PlayheadTime: React.FC = () => {
  const playhead = usePlayhead();
  const { duration } = usePlayback();
  const { mode, toDisplay } = useTimelineDisplay();
  const { configuredMode, canToggle, toggle } = useTimelineModeControl();
  // `duration` is optional on the context (the engine can be mounted
  // without a fallback prop and before any stream has registered); guard
  // here so the readout never shows `NaN`.
  const safeDuration = duration ?? 0;
  const safePlayhead = Math.min(playhead, safeDuration);
  const label = `${formatDisplayValue(toDisplay(safePlayhead), mode)} / ${formatDisplayValue(toDisplay(safeDuration), mode)}`;

  const readout = (
    <Text
      variant={TextVariant.Xs}
      color={TextColor.Secondary}
      // Inline rather than a class so it always beats voodo's own font
      // stack — same-specificity class order isn't guaranteed across builds.
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      }}
    >
      {label}
    </Text>
  );

  if (!canToggle) {
    return readout;
  }

  // The configured domain is whichever one isn't `duration`, so naming the
  // pair only needs to know which of the two is on screen right now.
  const configuredLabel =
    configuredMode.kind === "sequence" ? "frame numbers" : "timestamps";
  const showingConfigured = mode.kind !== "duration";
  const hint = showingConfigured
    ? toggleHint(configuredLabel, "elapsed time")
    : toggleHint("elapsed time", configuredLabel);

  return (
    <Tooltip
      anchor={Anchor.Top}
      content={hint}
      portal
      wrapperClassName={styles.playheadTimeTrigger}
    >
      {/* A real <button>: it takes Enter/Space natively, and the controls
          row's click handler skips clicks that land on one, so this never
          also toggles the tracks drawer. */}
      <button
        type="button"
        className={styles.playheadTime}
        data-testid="timeline-playhead-time"
        aria-label={hint}
        onClick={toggle}
      >
        {readout}
      </button>
    </Tooltip>
  );
};

export default PlayheadTime;
