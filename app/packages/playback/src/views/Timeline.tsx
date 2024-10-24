import React from "react";
import { SEEK_BAR_DEBOUNCE } from "../lib/constants";
import { TimelineName } from "../lib/state";
import { useFrameNumber } from "../lib/use-frame-number";
import { useTimeline } from "../lib/use-timeline";
import { useTimelineBuffers } from "../lib/use-timeline-buffers";
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
  controlsStyle?: React.CSSProperties;
}

/**
 * Renders a "classic" FO timeline with a seekbar, playhead, speed control, and status indicator.
 */
export const Timeline = React.memo(
  React.forwardRef<HTMLDivElement, TimelineProps>(
    (timelineProps: TimelineProps, ref) => {
      const { name, style, controlsStyle } = timelineProps;

      const { playHeadState, config, play, pause, setSpeed } =
        useTimeline(name);
      const frameNumber = useFrameNumber(name);

      const { getSeekValue, seekTo } = useTimelineVizUtils(name);

      const seekBarValue = React.useMemo(() => getSeekValue(), [getSeekValue]);

      const { loaded, loading } = useTimelineBuffers(name);

      const onChangeSeek = React.useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
          const newSeekBarValue = Number(e.target.value);
          seekTo(newSeekBarValue);
        },
        [seekTo]
      );

      const onSeekStart = React.useCallback(() => {
        pause();
        dispatchEvent(
          new CustomEvent("seek", {
            detail: { timelineName: name, start: true },
          })
        );
      }, [pause, name]);

      const onSeekEnd = React.useCallback(() => {
        dispatchEvent(
          new CustomEvent("seek", {
            detail: { timelineName: name, start: false },
          })
        );
      }, [name]);

      const [isHoveringSeekBar, setIsHoveringSeekBar] = React.useState(false);

      return (
        <FoTimelineContainer
          ref={ref}
          style={style}
          onMouseEnter={() => setIsHoveringSeekBar(true)}
          onMouseLeave={() => setIsHoveringSeekBar(false)}
          data-cy="imavid-container"
          data-timeline-name={name}
        >
          <Seekbar
            value={seekBarValue}
            totalFrames={config.totalFrames}
            loaded={loaded}
            loading={loading}
            onChange={onChangeSeek}
            onSeekStart={onSeekStart}
            onSeekEnd={onSeekEnd}
            debounce={SEEK_BAR_DEBOUNCE}
            data-cy="imavid-seekbar"
            data-timeline-name={name}
          />
          <SeekbarThumb
            shouldDisplayThumb={isHoveringSeekBar}
            value={seekBarValue}
            data-cy="imavid-seekbar-thumb"
            data-timeline-name={name}
          />
          <FoTimelineControlsContainer
            style={controlsStyle}
            data-cy="imavid-timeline-controls"
            data-timeline-name={name}
          >
            <Playhead
              status={playHeadState}
              timelineName={name}
              play={play}
              pause={pause}
              data-cy="imavid-playhead"
              data-timeline-name={name}
            />
            <Speed
              speed={config.speed ?? 1}
              setSpeed={setSpeed}
              data-cy="imavid-speed"
              data-timeline-name={name}
            />
            <StatusIndicator
              currentFrame={frameNumber}
              totalFrames={config.totalFrames}
              data-cy="imavid-status-indicator"
              data-timeline-name={name}
            />
          </FoTimelineControlsContainer>
        </FoTimelineContainer>
      );
    }
  )
);
