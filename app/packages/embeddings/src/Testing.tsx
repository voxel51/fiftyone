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
import { Timeline } from "@fiftyone/playback/src/views/Timeline";

interface TimelineProps {
  name?: TimelineName;
  style?: React.CSSProperties;
}

import { TimelineCreator } from "@fiftyone/playback/src/views/TimelineExamples";
