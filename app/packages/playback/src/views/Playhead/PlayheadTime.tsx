import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import { usePlayhead } from "../../lib/playback/use-playback-state";
import { formatTime } from "../TimelineControls/timeline-controls-utils";

/**
 * Live playhead time readout, displayed as `currentTime / duration`.
 * Isolated into its own component so consumers don't re-render on every
 * RAF tick just because the time changes.
 */
const PlayheadTime: React.FC = () => {
  const playhead = usePlayhead();
  const { duration } = usePlayback();
  // `duration` is optional on the context (the engine can be mounted
  // without a fallback prop and before any stream has registered); guard
  // here so the readout never shows `NaN`.
  const safeDuration = duration ?? 0;
  const safePlayhead = Math.min(playhead, safeDuration);
  return (
    <Text variant={TextVariant.Xs} color={TextColor.Secondary} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
      {`${formatTime(safePlayhead)} / ${formatTime(safeDuration)}`}
    </Text>
  );
};

export default PlayheadTime;
