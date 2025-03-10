import controlsStyles from "@fiftyone/looker/src/elements/common/controls.module.css";
import videoStyles from "@fiftyone/looker/src/elements/video.module.css";
import { BufferRange, Buffers } from "@fiftyone/utilities";
import React from "react";
import styled from "styled-components";
import {
  PLAYHEAD_STATE_PAUSED,
  PLAYHEAD_STATE_PLAYING,
  PlayheadState,
} from "../lib/constants";
import { TimelineName } from "../lib/state";
import { convertFrameNumberToPercentage } from "../lib/use-timeline-viz-utils";
import { getGradientStringForSeekbar } from "../lib/utils";
import BufferingIcon from "./svgs/buffering.svg?react";
import PauseIcon from "./svgs/pause.svg?react";
import PlayIcon from "./svgs/play.svg?react";
import SpeedIcon from "./svgs/speed.svg?react";
interface PlayheadProps {
  status: PlayheadState;
  timelineName: TimelineName;
  play: () => void;
  pause: () => void;
}

interface SpeedProps {
  speed: number;
  setSpeed: (speed: number) => void;
}

interface StatusIndicatorProps {
  currentFrame: number;
  totalFrames: number;
}

export const Playhead = React.forwardRef<
  HTMLDivElement,
  PlayheadProps & React.HTMLProps<HTMLDivElement>
>(({ status, play, pause, ...props }, ref) => {
  const { className, ...otherProps } = props;

  return (
    <TimelineElementContainer
      ref={ref}
      {...otherProps}
      className={`${className ?? ""} ${controlsStyles.lookerClickable}`}
      data-playhead-state={status}
    >
      {status === PLAYHEAD_STATE_PLAYING && <PauseIcon onClick={pause} />}
      {status === PLAYHEAD_STATE_PAUSED && <PlayIcon onClick={play} />}
      {status !== PLAYHEAD_STATE_PLAYING &&
        status !== PLAYHEAD_STATE_PAUSED && <BufferingIcon />}
    </TimelineElementContainer>
  );
});

export const Seekbar = React.forwardRef<
  HTMLInputElement,
  React.HTMLProps<HTMLInputElement> & {
    loaded: Buffers;
    loading: BufferRange;
    debounce?: number;
    style?: React.CSSProperties;
    totalFrames: number;
    value: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSeekStart: () => void;
    onSeekEnd: () => void;
  }
>(({ ...props }, ref) => {
  const {
    loaded,
    loading,
    totalFrames,
    value,
    onChange,
    onSeekStart,
    onSeekEnd,
    style,
    className,
    ...otherProps
  } = props;

  // convert buffer ranges to 1-100 percentage
  const loadedScaled = React.useMemo(() => {
    return loaded.map((buffer) => {
      return [
        convertFrameNumberToPercentage(buffer[0], totalFrames),
        convertFrameNumberToPercentage(buffer[1], totalFrames),
      ] as BufferRange;
    });
  }, [loaded]);

  const loadingScaled = React.useMemo(() => {
    return [
      convertFrameNumberToPercentage(loading[0], totalFrames),
      convertFrameNumberToPercentage(loading[1], totalFrames),
    ] as BufferRange;
  }, [loading]);

  const gradientString = React.useMemo(
    () =>
      getGradientStringForSeekbar(loadedScaled, loadingScaled, value, {
        unBuffered: "var(--fo-palette-neutral-softBorder)",
        currentProgress: "var(--fo-palette-primary-plainColor)",
        buffered: "var(--fo-palette-secondary-main)",
        loading: "#a86738",
      }),
    [loadedScaled, loadingScaled, value]
  );

  return (
    <input
      {...otherProps}
      max="100"
      min="0"
      ref={ref}
      type="range"
      value={value}
      className={`${className ?? ""} ${videoStyles.imaVidSeekBar} ${
        videoStyles.hideInputThumb
      }`}
      onChange={onChange}
      onMouseDown={onSeekStart}
      onMouseUp={onSeekEnd}
      style={
        {
          appearance: "none",
          outline: "none",
          background: gradientString,
          ...style,
        } as React.CSSProperties
      }
    />
  );
});

export const SeekbarThumb = React.forwardRef<
  HTMLInputElement,
  React.HTMLProps<HTMLDivElement> & {
    shouldDisplayThumb: boolean;
    value: number;
    style?: React.CSSProperties;
  }
>(({ shouldDisplayThumb, value, style, ...props }, ref) => {
  const progress = React.useMemo(() => Math.max(0, value - 0.5), [value]);

  return (
    <div
      {...props}
      ref={ref}
      className={`${videoStyles.lookerThumb} ${
        shouldDisplayThumb ? videoStyles.lookerThumbSeeking : ""
      }`}
      style={
        {
          "--progress": `${progress}%`,
          pointerEvents: "none",
          ...style,
        } as React.CSSProperties
      }
    />
  );
});

export const Speed = React.forwardRef<
  HTMLDivElement,
  SpeedProps &
    React.HTMLProps<HTMLDivElement> & {
      style?: React.CSSProperties;
    }
>(({ speed, setSpeed, ...props }, ref) => {
  const { style, className, ...otherProps } = props;

  const onChangeSpeed = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSpeed(parseFloat(e.target.value));
    },
    []
  );

  const rangeValue = React.useMemo(() => (speed / 2) * 100, [speed]);

  const resetSpeed = React.useCallback(() => {
    setSpeed(1);
  }, []);

  return (
    <TimelineElementContainer
      ref={ref}
      {...otherProps}
      className={`${className ?? ""} ${controlsStyles.lookerClickable} ${
        videoStyles.lookerPlaybackRate
      }`}
      style={{
        ...style,
        ...{
          gap: "0.25em",
        },
      }}
      title={`${speed}x (click to reset)`}
    >
      <SpeedIcon
        className={controlsStyles.lookerClickable}
        onClick={resetSpeed}
      />
      <input
        type="range"
        min="0.1"
        max="2"
        step="0.1"
        value={speed.toFixed(4)}
        className={videoStyles.hideInputThumb}
        title={`${speed}x`}
        style={
          {
            "--playback": `${rangeValue}%`,
          } as React.CSSProperties
        }
        onChange={onChangeSpeed}
      />
    </TimelineElementContainer>
  );
});

export const StatusIndicator = React.forwardRef<
  HTMLDivElement,
  StatusIndicatorProps & React.HTMLProps<HTMLDivElement>
>(({ currentFrame, totalFrames, ...props }, ref) => {
  const { className, ...otherProps } = props;

  return (
    <div
      ref={ref}
      {...otherProps}
      className={`${className ?? ""} ${controlsStyles.lookerTime}`}
    >
      {currentFrame} / {totalFrames}
    </div>
  );
});

const TimelineContainer = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: none;
  opacity: 1;
`;

const TimelineElementContainer = styled.div`
  display: flex;
`;

export const FoTimelineControlsContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5em;

  > * {
    padding: 2px;
  }
`;

export const FoTimelineContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLProps<HTMLDivElement>
>(({ ...props }, ref) => {
  return (
    <TimelineContainer
      className={controlsStyles.lookerControls}
      ref={ref}
      {...props}
    />
  );
});
