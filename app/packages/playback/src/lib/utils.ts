import { BufferRange, Buffers } from "@fiftyone/utilities";
import { getTimelineNameFromSampleAndGroupId } from "./use-default-timeline-name";

/**
 * Returns the event name for setting the frame number for a specific timeline.
 *
 * @param {string} timelineName - The name of the timeline.
 */
export const getTimelineSetFrameNumberEventName = (timelineName: string) =>
  `set-frame-number-${timelineName}`;

/**
 * Dispatches a custom event to set the frame number for a specific timeline.
 *
 * This function creates and dispatches a `CustomEvent` on the `#modal` DOM element.
 *
 * If the `timelineName` is not provided, the function attempts to derive it from the URL's query
 * parameters `id` (sampleId) and `groupId` by using the `getTimelineNameFromSampleAndGroupId`
 * function. If neither `sampleId` nor `groupId` is present in the URL, the function throws an error.
 *
 * @param {Object} options - The options object.
 * @param {string} [options.timelineName] - The name of the timeline. If omitted, it will be derived from the URL parameters.
 * @param {number} options.newFrameNumber - The new frame number to set (minimum value is 1).
 *
 */
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

  dispatchEvent(
    new CustomEvent(getTimelineSetFrameNumberEventName(timelineName), {
      detail: { frameNumber: Math.max(newFrameNumber, 1) },
    })
  );
};

/**
 * Generates a CSS linear-gradient string for a seekbar based on buffered, loading, and current progress ranges.
 *
 * Runtime complexity = O(n log n), where n is the number of loaded ranges.
 *
 * This function calculates gradient stops for a seekbar component by considering the buffered ranges (`loadedRangesScaled`),
 * the current loading range (`loadingRangeScaled`), and the user's current progress (`valueScaled`). It assigns colors
 * to different segments of the seekbar according to their states and priorities defined in `colorMap`.
 *
 * **Color Priorities (Highest to Lowest):**
 * 1. `currentProgress` - Represents the portion of the media that has been played.
 * 2. `loading` - Represents the portion currently being loaded.
 * 3. `buffered` - Represents the portions that are buffered and ready to play.
 * 4. `unBuffered` - Represents the portions that are not yet buffered.
 *
 * @param {Buffers} loadedRangesScaled - An array of buffered ranges, each as a tuple `[start, end]` scaled between 0 and 100.
 * @param {BufferRange} loadingRangeScaled - The current loading range as a tuple `[start, end]` scaled between 0 and 100.
 * @param {number} valueScaled - The current progress value scaled between 0 and 100.
 * @param {Object} colorMap - An object mapping state names to their corresponding color strings.
 * @param {string} colorMap.unBuffered - Color for unbuffered segments.
 * @param {string} colorMap.currentProgress - Color for the current progress segment.
 * @param {string} colorMap.buffered - Color for buffered segments.
 * @param {string} colorMap.loading - Color for the loading segment.
 *
 * @returns {string} A CSS `linear-gradient` string representing the seekbar's background.
 *
 * @example
 * const loadedRanges = [[0, 30], [40, 70]]; // Buffered ranges from 0% to 30% and 40% to 70%
 * const loadingRange = [30, 40];            // Currently loading from 30% to 40%
 * const currentValue = 50;                  // Current progress at 50%
 * const colors = {
 *   unBuffered: 'gray',
 *   currentProgress: 'blue',
 *   buffered: 'green',
 *   loading: 'red',
 * };
 *
 * const gradient = getGradientStringForSeekbar(
 *   loadedRanges,
 *   loadingRange,
 *   currentValue,
 *   colors
 * );
 * // Returns:
 * // "linear-gradient(to right, blue 0% 50%, green 50% 70%, gray 70% 100%)"
 */

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
