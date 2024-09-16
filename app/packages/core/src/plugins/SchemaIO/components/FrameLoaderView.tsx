import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import {
  DEFAULT_FRAME_NUMBER,
  GLOBAL_TIMELINE_ID,
} from "@fiftyone/playback/src/lib/constants";
import { BufferRange } from "@fiftyone/utilities";
import { usePanelEvent } from "@fiftyone/operators";
import {
  usePanelId,
  usePanelState,
  useSetPanelStateById,
} from "@fiftyone/spaces";
import { useTimeline } from "@fiftyone/playback/src/lib/use-timeline";
import _ from "lodash";
import { useDefaultTimelineName } from "@fiftyone/playback/src/lib/use-default-timeline-name";

export default function FrameLoaderView(props: ViewPropsType) {
  const { schema, path, data } = props;
  const { view = {} } = schema;
  const { on_load_range, timeline_id, target } = view;
  const { properties } = schema as ObjectSchemaType;
  const panelId = usePanelId();
  const [myLocalFrameNumber, setMyLocalFrameNumber] =
    React.useState(DEFAULT_FRAME_NUMBER);
  const triggerEvent = usePanelEvent();
  const setPanelState = useSetPanelStateById(true);
  const { getName } = useDefaultTimelineName();
  const timelineName = React.useMemo(() => getName(), [getName]);

  const loadRange = React.useCallback(async (range: BufferRange) => {
    console.log("loadRange", range);
    if (on_load_range) {
      return triggerEvent(panelId, {
        params: { range },
        operator: on_load_range,
      });
    }
  }, [triggerEvent, on_load_range]);

  useEffect(() => {
    loadRange([0, 50]);
  }, []);

  const [currentFrame, setCurrentFrame] = useState(DEFAULT_FRAME_NUMBER);

  const myRenderFrame = React.useCallback((frameNumber: number) => {
    setMyLocalFrameNumber(frameNumber);
    // console.log("rendering frame", frameNumber, props);
    setPanelState(panelId, (current) => {
      const currentFrameData = data?.frames[frameNumber] || {};
      const currentData = current.data ? _.cloneDeep(current.data) : {}; // Clone the object
      let updatedData = { ...currentData };
    
      console.log("data?.frames", data?.frames);
      console.log("target", target);
      _.set(updatedData, target, currentFrameData); // Use lodash set to update safely
      console.log("updatedData", updatedData);
    
      return { ...current, data: updatedData };
    });
    setCurrentFrame(frameNumber)
  }, [data, setPanelState, panelId, target]);

  const { isTimelineInitialized, subscribe } = useTimeline();

  React.useEffect(() => {
    if (isTimelineInitialized) {
      subscribe({
        id: `sub1`,
        loadRange,
        renderFrame: myRenderFrame,
      });
    }
  }, [isTimelineInitialized, loadRange, myRenderFrame, subscribe]);

  return (
    <h1>{currentFrame}</h1>
  )
}
