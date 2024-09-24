import controlsStyles from "@fiftyone/looker/src/elements/common/controls.module.css";
import styles from "@fiftyone/looker/src/elements/video.module.css";
import React from "react";
import styled from "styled-components";
import { PlayheadState, TimelineName } from "../lib/state";
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
}

interface StatusIndicatorProps {
  currentFrame: number;
  totalFrames: number;
}

export const Playhead = React.forwardRef<
  SVGSVGElement,
  PlayheadProps & React.SVGProps<SVGSVGElement>
>(({ status, timelineName, play, pause, ...props }, ref) => {
  if (status === "playing") {
    return <PauseIcon ref={ref} {...props} onClick={pause} />;
  }

  if (status === "paused") {
    return <PlayIcon ref={ref} {...props} onClick={play} />;
  }

  return (
    <>
      <BufferingIcon ref={ref} {...props} />;
    </>
  );
});

export const Seekbar = React.forwardRef<
  HTMLInputElement,
  React.HTMLProps<HTMLInputElement> & {
    bufferValue: number;
    value: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    debounce?: number;
  }
>(({ ...props }, ref) => {
  const { bufferValue, value, onChange, debounce, style, ...otherProps } =
    props;

  // todo: consider debouncing onChange

  return (
    <input
      {...otherProps}
      max="100"
      min="0"
      ref={ref}
      type="range"
      value={value}
      className={styles.lookerSeekBar}
      onChange={onChange}
      style={
        {
          appearance: "none",
          "--progress": `${value}%`,
          // todo: represent buffer in a range instead of percentage
          "--buffer-progress": `${bufferValue}%`,
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
  }
>(({ shouldDisplayThumb, value, style, ...props }, ref) => {
  const progress = React.useMemo(() => Math.max(0, value - 0.5), [value]);

  return (
    <div
      {...props}
      ref={ref}
      className={`${styles.lookerThumb} ${
        shouldDisplayThumb ? styles.lookerThumbSeeking : ""
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
  SpeedProps & React.HTMLProps<HTMLDivElement>
>(({ speed, ...props }, ref) => {
  return (
    <div ref={ref} {...props}>
      <SpeedIcon />
    </div>
  );
});

export const StatusIndicator = React.forwardRef<
  HTMLDivElement,
  StatusIndicatorProps & React.HTMLProps<HTMLDivElement>
>(({ currentFrame, totalFrames, ...props }, ref) => {
  return (
    <div>
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

export const FoTimelineControlsContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: row;
  gap: 10px;
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
