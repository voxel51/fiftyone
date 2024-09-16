export function main() {
  registerComponent({
    name: "TimelineCreator",
    label: "TimelineCreator",
    component: TimelineCreator,
    type: PluginComponentType.Panel,
    activator: () => true,
    panelOptions: {
      surfaces: "modal",
    },
  });
}

import { BufferRange } from "@fiftyone/utilities";
import React from "react";
import {
  DEFAULT_FRAME_NUMBER,
  GLOBAL_TIMELINE_ID,
  SEEK_BAR_DEBOUNCE,
} from "@fiftyone/playback/src/lib/constants";
import { TimelineName } from "@fiftyone/playback/src/lib/state";
import { useCreateTimeline } from "@fiftyone/playback/src/lib/use-create-timeline";
import { useTimeline } from "@fiftyone/playback/src/lib/use-timeline";
import { useTimelineVizUtils } from "@fiftyone/playback/src/lib/use-timeline-viz-utils";
import {
  FoTimelineContainer,
  FoTimelineControlsContainer,
  Playhead,
  Seekbar,
  SeekbarThumb,
  Speed,
  StatusIndicator,
} from "@fiftyone/playback/src/views/PlaybackElements";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { useDefaultTimelineName } from "@fiftyone/playback/src/lib/use-default-timeline-name";
import {Timeline} from "@fiftyone/playback/src/views/Timeline";

interface TimelineProps {
  name?: TimelineName;
  style?: React.CSSProperties;
}
export const TimelineCreator = () => {
  const [myLocalFrameNumber, setMyLocalFrameNumber] =
    React.useState(DEFAULT_FRAME_NUMBER);
  const { getName } = useDefaultTimelineName();
  const timelineName = React.useMemo(() => getName(), [getName]);

  const loadRange = React.useCallback(async (range: BufferRange) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  }, []);

  const myRenderFrame = React.useCallback(
    (frameNumber: number) => {
      setMyLocalFrameNumber(frameNumber);
    },
    [setMyLocalFrameNumber]
  );

  const { isTimelineInitialized, subscribe } = useCreateTimeline({
    config: {
      totalFrames: 50,
      loop: true,
    },
  });

  React.useEffect(() => {
    if (isTimelineInitialized) {
      subscribe({
        id: `creator`,
        loadRange,
        renderFrame: myRenderFrame,
      });
    }
  }, [isTimelineInitialized, loadRange, myRenderFrame, subscribe]);

  if (!isTimelineInitialized) {
    return <div>initializing timeline...</div>;
  }

  return (
    <>
      <div style={{ margin: "1em" }}>
        creator frame number {timelineName}: {myLocalFrameNumber}
      </div>
      <Timeline name={timelineName} />
    </>
  );
};

export const TimelineSubscriber1 = () => {
  const { getName } = useDefaultTimelineName();
  const timelineName = React.useMemo(() => getName(), [getName]);

  const [myLocalFrameNumber, setMyLocalFrameNumber] =
    React.useState(DEFAULT_FRAME_NUMBER);

  const loadRange = React.useCallback(async (range: BufferRange) => {
    // no-op for now, but maybe for testing, i can resolve a promise inside settimeout
  }, []);

  const myRenderFrame = React.useCallback((frameNumber: number) => {
    setMyLocalFrameNumber(frameNumber);
  }, []);

  const { subscribe, isTimelineInitialized, getFrameNumber } = useTimeline();

  React.useEffect(() => {
    if (!isTimelineInitialized) {
      return;
    }

    subscribe({
      id: `sub1`,
      loadRange,
      renderFrame: myRenderFrame,
    });
  }, [loadRange, myRenderFrame, subscribe, isTimelineInitialized]);

  if (!isTimelineInitialized) {
    return <div>loading...</div>;
  }

  return (
    <>
      <div style={{ margin: "1em" }}>
        Subscriber 1 frame number {timelineName}: {myLocalFrameNumber}
      </div>
      <Timeline name={timelineName} />
    </>
  );
};

export const TimelineSubscriber2 = () => {
  const { getName } = useDefaultTimelineName();
  const timelineName = React.useMemo(() => getName(), [getName]);

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
      id: `sub2`,
      loadRange,
      renderFrame: myRenderFrame,
    });
  }, [loadRange, myRenderFrame, subscribe, isTimelineInitialized]);

  if (!isTimelineInitialized) {
    return <div>loading...</div>;
  }

  return (
    <>
      <div style={{ margin: "1em" }}>
        Subscriber 2 frame number {timelineName}: {myLocalFrameNumber}
      </div>
    </>
  );
};
