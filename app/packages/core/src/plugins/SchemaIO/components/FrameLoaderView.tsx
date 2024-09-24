import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import {
  DEFAULT_FRAME_NUMBER,
  GLOBAL_TIMELINE_ID,
} from "@fiftyone/playback/src/lib/constants";
import { BufferManager, BufferRange } from "@fiftyone/utilities";
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
  const localIdRef = React.useRef<string>();
  const bufm = useRef(new BufferManager());

  useEffect(() => {
    localIdRef.current = Math.random().toString(36).substring(7);
    // console.log("localIdRef", localIdRef.current);
    if (data?.frames)
      // console.log("dispatching frames-loaded", localIdRef.current);
      dispatchEvent(
        new CustomEvent(`frames-loaded`, {
          detail: { localId: localIdRef.current },
        })
      );
  }, [data?.signature]); // remove this JSON.strignify

  const loadRange = React.useCallback(
    async (range: BufferRange) => {
      if (on_load_range) {
        // if (!bufm.current.containsRange(range)) {
        //   // only trigger event if the range is not already in the buffer
        //   await triggerEvent(panelId, {
        //     params: { range },
        //     operator: on_load_range,
        //   });
        // }
        const unp = bufm.current.getUnprocessedBufferRange(range);
        const isProcessed = unp === null;

        if (!isProcessed) {
          await triggerEvent(panelId, {
            params: { range: unp },
            operator: on_load_range,
          });
        }
        console.log("loading range", range);
        return new Promise<void>((resolve) => {
          window.addEventListener(`frames-loaded`, (e) => {
            // console.log("frames loaded", e, {'current': localIdRef.current, 'detail': e.detail.localId});
            if (
              e instanceof CustomEvent &&
              e.detail.localId === localIdRef.current
            ) {
              // console.log("resolving");
              bufm.current.addNewRange(range);
              resolve();
            }
          });
        });
      }
    },
    [triggerEvent, on_load_range, localIdRef.current]
  );

  const [currentFrame, setCurrentFrame] = useState(DEFAULT_FRAME_NUMBER);

  const myRenderFrame = React.useCallback(
    (frameNumber: number) => {
      setMyLocalFrameNumber(frameNumber);
      // console.log("rendering frame", frameNumber, props);
      setPanelState(panelId, (current) => {
        const currentData = current.data ? _.cloneDeep(current.data) : {}; // Clone the object
        const currentFrameData = _.get(currentData, path, { frames: [] })
          .frames[frameNumber];
        let updatedData = { ...currentData };
        _.set(updatedData, target, currentFrameData); // Use lodash set to update safely
        return { ...current, data: updatedData };
      });
      setCurrentFrame(frameNumber);
    },
    [data, setPanelState, panelId, target]
  );

  const { isTimelineInitialized, subscribe } = useTimeline();
  const [subscribed, setSubscribed] = useState(false);

  React.useEffect(() => {
    if (subscribed) return;
    if (isTimelineInitialized) {
      subscribe({
        id: timeline_id || GLOBAL_TIMELINE_ID,
        loadRange,
        renderFrame: myRenderFrame,
      });
      setSubscribed(true);
    }
  }, [isTimelineInitialized, loadRange, myRenderFrame, subscribe]);

  return null;
}
