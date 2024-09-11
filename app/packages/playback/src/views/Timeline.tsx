import React from "react";
import { SEEK_BAR_DEBOUNCE } from "../lib/constants";
import { TimelineName } from "../lib/state";
import { useFrameNumber } from "../lib/use-frame-number";
import { useTimeline } from "../lib/use-timeline";
import { useTimelineVizUtils } from "../lib/use-timeline-viz-utils";
import {
  FoTimelineContainer,
  FoTimelineControlsContainer,
  Playhead,
  Seekbar,
  SeekbarThumb,
  Speed,
  StatusIndicator,
} from "./PlaybackElements";

interface TimelineProps {
  name: TimelineName;
  style?: React.CSSProperties;
}

/**
 * Renders a "classic" FO timeline with a seekbar, playhead, speed control, and status indicator.
 */
export const Timeline = React.forwardRef<HTMLDivElement, TimelineProps>(
  ({ name, style }, ref) => {
    const { playHeadState, config, play, pause } = useTimeline(name);
    const frameNumber = useFrameNumber(name);

    const { getSeekValue, seekTo } = useTimelineVizUtils();

    const seekBarValue = React.useMemo(() => getSeekValue(), [frameNumber]);

    const onChangeSeek = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSeekBarValue = Number(e.target.value);
        seekTo(newSeekBarValue);
      },
      []
    );

    const [isHoveringSeekBar, setIsHoveringSeekBar] = React.useState(false);

    return (
      <FoTimelineContainer
        ref={ref}
        style={style}
        onMouseEnter={() => setIsHoveringSeekBar(true)}
        onMouseLeave={() => setIsHoveringSeekBar(false)}
      >
        <Seekbar
          value={seekBarValue}
          bufferValue={0}
          onChange={onChangeSeek}
          debounce={SEEK_BAR_DEBOUNCE}
        />
        <SeekbarThumb
          shouldDisplayThumb={isHoveringSeekBar}
          value={seekBarValue}
        />
        <FoTimelineControlsContainer>
          <Playhead
            status={playHeadState}
            timelineName={name}
            play={play}
            pause={pause}
          />
          <Speed speed={0.3} />
          <StatusIndicator
            currentFrame={frameNumber}
            totalFrames={config.totalFrames}
          />
        </FoTimelineControlsContainer>
      </FoTimelineContainer>
    );
  }
);
