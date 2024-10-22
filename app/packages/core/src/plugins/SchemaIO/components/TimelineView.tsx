import React from "react";
import { Timeline, useCreateTimeline, useTimeline } from "@fiftyone/playback";
import { ViewPropsType } from "../utils/types";

export default function TimelineView(props: ViewPropsType) {
  const { schema } = props;
  const { view = {} } = schema;
  const { timeline_name, loop, total_frames } = view;

  const providedcConfig = {
    loop,
    totalFrames: total_frames,
  };

  const defaultConfig = {
    loop: false,
  };
  const finalConfig = {
    ...defaultConfig,
    ...providedcConfig,
  };

  const requiredParams = ["timeline_name", "total_frames"];

  // for (const param of requiredParams) {
  //   if (!finalConfig[param]) {
  //     throw new Error(`Missing required parameter: ${param}`);
  //   }
  // }

  return <TimelineCreator timelineName={timeline_name} {...finalConfig} />;
}

export const TimelineCreator = ({ timelineName, totalFrames, loop }) => {
  const { isTimelineInitialized } = useCreateTimeline({
    name: timelineName,
    config: {
      totalFrames: totalFrames,
      loop,
    },
  });

  if (!isTimelineInitialized) {
    return <div>initializing timeline...</div>;
  }

  return <Timeline name={timelineName} />;
};
