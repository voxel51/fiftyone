import React, { useMemo } from "react";
import { Timeline, useCreateTimeline, useTimeline } from "@fiftyone/playback";
import { ViewPropsType } from "../utils/types";

const DEFAULT_CONFIG = { loop: false };

export default function TimelineView(props: ViewPropsType) {
  const { schema } = props;
  const { view = {} } = schema;
  const { timeline_name, loop, total_frames } = view;

  const providedConfig = {
    loop,
    totalFrames: total_frames,
  };

  const finalConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...providedConfig }),
    [providedConfig]
  );
  if (!timeline_name) {
    throw new Error("Timeline name is required");
  }
  if (!finalConfig.totalFrames) {
    throw new Error("Total frames is required");
  }

  return <TimelineCreator timelineName={timeline_name} {...finalConfig} />;
}

export const TimelineCreator = ({ timelineName, totalFrames, loop }) => {
  const config = useMemo(() => ({ totalFrames, loop }), [totalFrames, loop]);
  const { isTimelineInitialized } = useCreateTimeline({
    name: timelineName,
    config,
  });

  if (!isTimelineInitialized) {
    return null;
  }

  return <Timeline name={timelineName} />;
};
