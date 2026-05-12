import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React from "react";
import { playheadAtom } from "../../lib/playback/atoms";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import { formatTime } from "../TimelineControls/timeline-controls-utils";

/**
 * Live playhead time readout, displayed as `currentTime / duration`.
 * Isolated into its own component so consumers don't re-render on every
 * RAF tick just because the time changes.
 */
const PlayheadTime: React.FC = () => {
  const playhead = useAtomValue(playheadAtom);
  const { duration } = usePlayback();
  return (
    <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
      {`${formatTime(playhead)} / ${formatTime(duration)}`}
    </Text>
  );
};

export default PlayheadTime;
