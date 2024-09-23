import { BufferRange, Buffers } from "@fiftyone/utilities";
import { getTimelineNameFromSampleAndGroupId } from "./use-default-timeline-name";

export const getTimelineSetFrameNumberEventName = (timelineName: string) =>
  `set-frame-number-${timelineName}`;

export const dispatchTimelineSetFrameNumberEvent = ({
  timelineName: mayBeTimelineName,
  newFrameNumber,
}: {
  timelineName?: string;
  newFrameNumber: number;
}) => {
  let timelineName = "";

  if (!mayBeTimelineName) {
    // get it from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sampleId = urlParams.get("id");
    const groupId = urlParams.get("groupId");

    if (!sampleId && !groupId) {
      throw new Error(
        "No timeline name provided and no 'id' or 'groupId' query param in URL"
      );
    }
    timelineName = getTimelineNameFromSampleAndGroupId(sampleId, groupId);
  } else {
    timelineName = mayBeTimelineName;
  }

  document.getElementById("modal")!.dispatchEvent(
    new CustomEvent(getTimelineSetFrameNumberEventName(timelineName), {
      detail: { frameNumber: Math.max(newFrameNumber, 1) },
    })
  );
};

export const getGradientStringForSeekbar = (
  loadedRangesScaled: Buffers,
  loadingRangeScaled: BufferRange,
  valueScaled: number,
  colorMap: {
    unBuffered: string;
    currentProgress: string;
    buffered: string;
    loading: string;
  }
) => {
  const colorPriority = {
    [colorMap.currentProgress]: 4,
    [colorMap.loading]: 3,
    [colorMap.unBuffered]: 2,
    [colorMap.buffered]: 1,
  };

  const events = [];

  // add loaded ranges
  loadedRangesScaled.forEach((range) => {
    events.push({
      pos: range[0],
      type: "start",
      color: colorMap.buffered,
      priority: colorPriority[colorMap.buffered],
    });
    events.push({
      pos: range[1],
      type: "end",
      color: colorMap.buffered,
      priority: colorPriority[colorMap.buffered],
    });
  });

  // add loading range
  events.push({
    pos: loadingRangeScaled[0],
    type: "start",
    color: colorMap.loading,
    priority: colorPriority[colorMap.loading],
  });
  events.push({
    pos: loadingRangeScaled[1],
    type: "end",
    color: colorMap.loading,
    priority: colorPriority[colorMap.loading],
  });

  // add current progress range
  events.push({
    pos: 0,
    type: "start",
    color: colorMap.currentProgress,
    priority: colorPriority[colorMap.currentProgress],
  });
  events.push({
    pos: valueScaled,
    type: "end",
    color: colorMap.currentProgress,
    priority: colorPriority[colorMap.currentProgress],
  });

  // sort events
  events.sort((a, b) => {
    if (a.pos !== b.pos) {
      return a.pos - b.pos;
    } else if (a.type !== b.type) {
      return a.type === "start" ? -1 : 1;
    } else {
      return b.priority - a.priority;
    }
  });

  const ranges = [];
  const activeColors = [];
  let prevPos = 0;
  let prevColor = colorMap.unBuffered;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const currPos = event.pos;

    if (currPos > prevPos) {
      // add range from prevPos to currPos with prevColor
      ranges.push({ start: prevPos, end: currPos, color: prevColor });
    }

    // update active colors stack
    if (event.type === "start") {
      activeColors.push({
        color: event.color,
        priority: event.priority,
      });
      // sort lowest priority first
      activeColors.sort((a, b) => a.priority - b.priority);
    } else {
      // remove color from activeColors
      const index = activeColors.findIndex((c) => c.color === event.color);
      if (index !== -1) {
        activeColors.splice(index, 1);
      }
    }

    // update prevColor to current highest priority color
    const newColor =
      activeColors.length > 0
        ? activeColors[activeColors.length - 1].color
        : colorMap.unBuffered;

    prevPos = currPos;
    prevColor = newColor;
  }

  // handle remaining range till 100%
  if (prevPos < 100) {
    ranges.push({ start: prevPos, end: 100, color: prevColor });
  }

  // merge adjacent ranges with same color
  const mergedRanges = [];
  for (let i = 0; i < ranges.length; i++) {
    const last = mergedRanges[mergedRanges.length - 1];
    const current = ranges[i];
    if (last && last.color === current.color && last.end === current.start) {
      // extend last range
      last.end = current.end;
    } else {
      mergedRanges.push({ ...current });
    }
  }

  const gradientStops = mergedRanges.map(
    (range) => `${range.color} ${range.start}% ${range.end}%`
  );

  return `linear-gradient(to right, ${gradientStops.join(", ")})`;
};
