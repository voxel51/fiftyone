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
import { useCreateTimeline } from "@fiftyone/playback/src/lib/use-create-timeline";
import { Timeline } from "@mui/icons-material";
import _ from "lodash";

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
  const panelState = usePanelState(null, panelId, true);

  const loadRange = React.useCallback(async (range: BufferRange) => {
    if (on_load_range) {
      triggerEvent(panelId, {
        params: { range },
        operator: on_load_range,
      });
    }
  }, []);

  const [currentFrame, setCurrentFrame] = useState(DEFAULT_FRAME_NUMBER);

  const myRenderFrame = React.useCallback((frameNumber: number) => {
    setMyLocalFrameNumber(frameNumber);
    console.log("rendering frame", frameNumber, props);
    setPanelState(panelId, (current) => {
      const currentFrameData = data?.frames[frameNumber] || {};
      const currentData = current.data || {};
      const updatedData = { ...currentData };
      console.log("currentData", currentData);
      _.set(updatedData, target, currentFrameData);
      console.log("updatedData", updatedData);
      return { ...current, data: updatedData };
    });
    setCurrentFrame(frameNumber)
  }, []);

  const { isTimelineInitialized, subscribe } = useCreateTimeline({
    config: {
      totalFrames: 50,
      loop: true,
    },
  });

  useEffect(() => {
    console.log("data", data);
  }, [data]);

  React.useEffect(() => {
    if (isTimelineInitialized) {
      subscribe({
        name: timeline_id || GLOBAL_TIMELINE_ID,
        subscription: {
          id: "sub1", // hmmm
          loadRange,
          renderFrame: myRenderFrame,
        },
      });
    }
  }, [isTimelineInitialized, loadRange, myRenderFrame]);

  return (
    <h1>{currentFrame}</h1>
  )
}
