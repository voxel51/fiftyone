import type { BufferRange, Buffers } from "@fiftyone/utilities";
import controlsStyles from "@fiftyone/looker/src/elements/common/controls.module.css";
import React from "react";
import {
  PLAYHEAD_STATE_BUFFERING,
  PLAYHEAD_STATE_PAUSED,
  PLAYHEAD_STATE_PLAYING,
  type PlayheadState,
} from "../../src/lib/constants";
import {
  FoTimelineContainer,
  FoTimelineControlsContainer,
  Playhead,
  Seekbar,
  SeekbarThumb,
  Speed,
} from "../../src/views/PlaybackElements";
import type { PlayState } from "../types";
import styles from "./duration-timeline-controls.module.css";

type DurationTimelineControlsProps = {
  title: string;
  subtitle?: string | null;
  playState: PlayState;
  currentTime: number;
  duration: number;
  speed: number;
  loaded: Buffers;
  loading: BufferRange;
  canControlPlayback?: boolean;
  formatTime: (value: number) => string;
  onTogglePlay: () => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onSeekPercentage: (percentage: number) => void;
  onSpeedChange: (speed: number) => void;
};

type DurationStatusIndicatorProps = {
  currentTime: number;
  duration: number;
  formatTime: (value: number) => string;
  playState: PlayState;
};

const DURATION_SEEKBAR_TOTAL_FRAMES = 101;

function scaleToPercentage(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / total) * 100));
}

function getPlayheadState(playState: PlayState): PlayheadState {
  if (playState === "buffering") {
    return PLAYHEAD_STATE_BUFFERING;
  }

  if (playState === "playing" || playState === "following") {
    return PLAYHEAD_STATE_PLAYING;
  }

  return PLAYHEAD_STATE_PAUSED;
}

function DurationStatusIndicator({
  currentTime,
  duration,
  formatTime,
  playState,
}: DurationStatusIndicatorProps) {
  return (
    <div className={`${controlsStyles.lookerTime} ${styles.statusIndicator}`}>
      <span>{`${formatTime(currentTime)} / ${formatTime(duration)}`}</span>
      {playState === "following" ? (
        <span className={styles.secondaryText}>following</span>
      ) : null}
    </div>
  );
}

/**
 * Renders a duration timeline using the classic playback layout with
 * nanosecond-based seek and buffering semantics.
 */
export const DurationTimelineControls = React.memo(
  React.forwardRef<HTMLDivElement, DurationTimelineControlsProps>(
    (timelineProps, ref) => {
      const {
        title,
        subtitle,
        playState,
        currentTime,
        duration,
        speed,
        loaded,
        loading,
        canControlPlayback = true,
        formatTime,
        onTogglePlay,
        onSeekStart,
        onSeekEnd,
        onSeekPercentage,
        onSpeedChange,
      } = timelineProps;

      const currentPercentage = React.useMemo(
        () => scaleToPercentage(currentTime, duration),
        [currentTime, duration]
      );
      const loadedScaled = React.useMemo(
        () =>
          loaded.map((range) => [
            scaleToPercentage(range[0], duration) + 1,
            scaleToPercentage(range[1], duration) + 1,
          ]) as Buffers,
        [duration, loaded]
      );
      const loadingScaled = React.useMemo(
        () =>
          [
            scaleToPercentage(loading[0], duration) + 1,
            scaleToPercentage(loading[1], duration) + 1,
          ] as BufferRange,
        [duration, loading]
      );
      const playheadState = React.useMemo(
        () => getPlayheadState(playState),
        [playState]
      );
      const [isHoveringSeekBar, setIsHoveringSeekBar] = React.useState(false);

      const onChangeSeek = React.useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
          const nextSeekBarValue = Number(event.target.value);
          onSeekPercentage(nextSeekBarValue);
        },
        [onSeekPercentage]
      );

      const timelineName = "mcap-duration";

      return (
        <FoTimelineContainer
          ref={ref}
          className={`${styles.root} ${controlsStyles.lookerControls}`}
          data-play-state={playState}
          data-cy="imavid-container"
          data-timeline-name={timelineName}
          onMouseEnter={() => setIsHoveringSeekBar(true)}
          onMouseLeave={() => setIsHoveringSeekBar(false)}
          title={subtitle ?? title}
        >
          <Seekbar
            aria-label="Timeline seekbar"
            data-cy="imavid-seekbar"
            data-timeline-name={timelineName}
            value={currentPercentage}
            totalFrames={DURATION_SEEKBAR_TOTAL_FRAMES}
            loaded={loadedScaled}
            loading={loadingScaled}
            onChange={onChangeSeek}
            onSeekStart={onSeekStart ?? (() => {})}
            onSeekEnd={onSeekEnd ?? (() => {})}
          />
          <SeekbarThumb
            shouldDisplayThumb={isHoveringSeekBar}
            value={currentPercentage + 0.5}
            data-cy="imavid-seekbar-thumb"
            data-timeline-name={timelineName}
          />
          <FoTimelineControlsContainer
            className={styles.controlsRow}
            data-cy="imavid-timeline-controls"
            data-timeline-name={timelineName}
          >
            <Playhead
              status={playheadState}
              timelineName={timelineName}
              play={canControlPlayback ? onTogglePlay : () => {}}
              pause={canControlPlayback ? onTogglePlay : () => {}}
              data-cy="imavid-playhead"
              data-timeline-name={timelineName}
            />
            <Speed
              speed={speed}
              setSpeed={onSpeedChange}
              data-cy="imavid-speed"
              data-timeline-name={timelineName}
            />
            <DurationStatusIndicator
              currentTime={currentTime}
              duration={duration}
              formatTime={formatTime}
              playState={playState}
            />
          </FoTimelineControlsContainer>
        </FoTimelineContainer>
      );
    }
  )
);

DurationTimelineControls.displayName = "DurationTimelineControls";
