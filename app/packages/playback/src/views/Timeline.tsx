import { BufferRange } from "@fiftyone/utilities";
import React from "react";
import {
  DEFAULT_FRAME_NUMBER,
  GLOBAL_TIMELINE_ID,
  SEEK_BAR_DEBOUNCE,
} from "../lib/constants";
import { TimelineName } from "../lib/state";
import { useCreateTimeline } from "../lib/use-create-timeline";
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
  name?: TimelineName;
  style?: React.CSSProperties;
}

/**
 * Renders a "classic" FO timeline with a seekbar, playhead, speed control, and status indicator.
 */
export const Timeline = React.forwardRef<HTMLDivElement, TimelineProps>(
  ({ name: maybeTimelineName, style }, ref) => {
    const name = maybeTimelineName ?? GLOBAL_TIMELINE_ID;

    const { frameNumber, playHeadState, config, play, pause } =
      useTimeline(name);

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

export const ComponentWithTimeline = () => {
  const [myLocalFrameNumber, setMyLocalFrameNumber] =
    React.useState(DEFAULT_FRAME_NUMBER);

  const loadRange = React.useCallback(async (range: BufferRange) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  }, []);

  const myRenderFrame = React.useCallback((frameNumber: number) => {
    setMyLocalFrameNumber(frameNumber);
  }, []);

  const { isTimelineInitialized, subscribe } = useCreateTimeline({
    config: {
      totalFrames: 50,
      loop: true,
    },
  });

  React.useEffect(() => {
    if (isTimelineInitialized) {
      subscribe({
        name: GLOBAL_TIMELINE_ID,
        subscription: {
          id: "sub1",
          loadRange,
          renderFrame: myRenderFrame,
        },
      });
    }
  }, [isTimelineInitialized, loadRange, myRenderFrame]);

  if (!isTimelineInitialized) {
    return <div>loading...</div>;
  }

  return (
    <>
      <div style={{ margin: "1em" }}>
        sub1 frame number: {myLocalFrameNumber}
      </div>
      <Timeline key="sub2timeline" />
    </>
  );
};

export const Component2WithTimeline = () => {
  const [myLocalFrameNumber, setMyLocalFrameNumber] =
    React.useState(DEFAULT_FRAME_NUMBER);

  const loadRange = React.useCallback(async (range: BufferRange) => {
    // no-op for now, but maybe for testing, i can resolve a promise inside settimeout
  }, []);

  const myRenderFrame = React.useCallback((frameNumber: number) => {
    setMyLocalFrameNumber(frameNumber);
  }, []);

  const { subscribe, isTimelineInitialized } = useTimeline();

  React.useEffect(() => {
    if (!isTimelineInitialized) {
      return;
    }

    subscribe({
      name: GLOBAL_TIMELINE_ID,
      subscription: {
        id: "sub2",
        loadRange,
        renderFrame: myRenderFrame,
      },
    });
  }, [loadRange, myRenderFrame, isTimelineInitialized]);

  if (!isTimelineInitialized) {
    return <div>loading...</div>;
  }

  return (
    <>
      <div style={{ margin: "1em" }}>
        sub2 frame number: {myLocalFrameNumber}
      </div>
      <Timeline key="sub2timeline" />
    </>
  );
};

export const Component3WithTimeline = () => {
  const [myLocalFrameNumber, setMyLocalFrameNumber] =
    React.useState(DEFAULT_FRAME_NUMBER);

  const loadRange = React.useCallback(async (range: BufferRange) => {
    // no-op for now, but maybe for testing, i can resolve a promise inside settimeout
  }, []);

  const myRenderFrame = React.useCallback((frameNumber: number) => {
    setMyLocalFrameNumber(frameNumber);
  }, []);

  const { subscribe, isTimelineInitialized } = useTimeline();

  React.useEffect(() => {
    if (!isTimelineInitialized) {
      return;
    }

    subscribe({
      name: GLOBAL_TIMELINE_ID,
      subscription: {
        id: "sub3",
        loadRange,
        renderFrame: myRenderFrame,
      },
    });
  }, [loadRange, myRenderFrame, isTimelineInitialized]);

  if (!isTimelineInitialized) {
    return <div>loading...</div>;
  }

  return (
    <>
      <div style={{ margin: "1em" }}>
        sub3 frame number: {myLocalFrameNumber}
      </div>
    </>
  );
};
