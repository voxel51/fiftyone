import { BufferRange } from "@fiftyone/utilities";
import React from "react";
import { DEFAULT_FRAME_NUMBER } from "../lib/constants";
import { useCreateTimeline } from "../lib/use-create-timeline";
import { useDefaultTimelineNameImperative } from "../lib/use-default-timeline-name";
import { useTimeline } from "../lib/use-timeline";
import { Timeline } from "./Timeline";

/**
 * The following components serve as contrived examples of using the timeline API.
 * You can use them as a reference to understand how to create and subscribe to timelines. 
 * 
 * You can use these components as modal panel plugins to get started. To do this you can paste the following code in one of the modules that is loaded by the app (like `Grid.tsx`):

// ADD IMPORTS
import { TimelineSubscriber1, TimelineSubscriber2, TimelineCreator } from "@fiftyone/playback/src/views/TimelineExample";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";

registerComponent({
  name: "TimelineCreator",
  label: "Timeline Creator",
  component: TimelineCreator,
  activator: () => true,
  type: PluginComponentType.Panel,
  panelOptions: {
    surfaces: 'modal',
    helpMarkdown: `Example creator with a timeline`
  }
});

registerComponent({
  name: "TimelineSubscriber 1",
  label: "Timeline Subscriber 1",
  component: TimelineSubscriber1,
  activator: () => true,
  type: PluginComponentType.Panel,
  panelOptions: {
    surfaces: 'modal',
    helpMarkdown: `Example subscriber with a timeline`
  }
});

registerComponent({
  name: "TimelineSubscriber 2",
  label: "Timeline Subscriber 2",
  component: TimelineSubscriber2,
  activator: () => true,
  type: PluginComponentType.Panel,
  panelOptions: {
    surfaces: 'modal',
    helpMarkdown: `Example subscriber with a timeline`
  }
});

 */

export const TimelineCreator = () => {
  const [myLocalFrameNumber, setMyLocalFrameNumber] =
    React.useState(DEFAULT_FRAME_NUMBER);
  const { getName } = useDefaultTimelineNameImperative();
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

export const TimelineSubscriber2 = () => {
  const { getName } = useDefaultTimelineNameImperative();
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
