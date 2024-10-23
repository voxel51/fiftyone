import React, { useEffect, useRef, useState } from "react";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import { DEFAULT_FRAME_NUMBER } from "@fiftyone/playback/src/lib/constants";
import { BufferManager, BufferRange } from "@fiftyone/utilities";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId, useSetPanelStateById } from "@fiftyone/spaces";
import { useTimeline } from "@fiftyone/playback/src/lib/use-timeline";
import _ from "lodash";

const FRAME_LOADED_EVENT = "frames-loaded";

export default function FrameLoaderView(props: ViewPropsType) {
  const { schema, path, data } = props;
  const { view = {} } = schema;
  const { on_load_range, target, timeline_name } = view;
  const panelId = usePanelId();
  const triggerEvent = usePanelEvent();
  const setPanelState = useSetPanelStateById(true);
  const localIdRef = React.useRef<string>();
  const bufm = useRef(new BufferManager());
  const frameDataRef = useRef<typeof data.frames>(null);

  useEffect(() => {
    localIdRef.current = Math.random().toString(36).substring(7);
    if (data?.frames) frameDataRef.current = data.frames;
    window.dispatchEvent(
      new CustomEvent(FRAME_LOADED_EVENT, {
        detail: { localId: localIdRef.current },
      })
    );
  }, [data?.signature]);

  const loadRange = React.useCallback(
    async (range: BufferRange) => {
      if (on_load_range) {
        const unp = bufm.current.getUnprocessedBufferRange(range);
        const isProcessed = unp === null;

        if (!isProcessed) {
          await triggerEvent(panelId, {
            params: { range: unp },
            operator: on_load_range,
          });
        }

        return new Promise<void>((resolve) => {
          if (frameDataRef.current) {
            bufm.current.addNewRange(range);
            resolve();
          } else {
            const onFramesLoaded = (e) => {
              if (
                e instanceof CustomEvent &&
                e.detail.localId === localIdRef.current
              ) {
                window.removeEventListener(FRAME_LOADED_EVENT, onFramesLoaded);
                bufm.current.addNewRange(range);
                resolve();
              }
            };
            window.addEventListener(FRAME_LOADED_EVENT, onFramesLoaded);
          }
        });
      }
    },
    [triggerEvent, on_load_range, localIdRef.current]
  );

  const [currentFrame, setCurrentFrame] = useState(DEFAULT_FRAME_NUMBER);

  const myRenderFrame = React.useCallback(
    (frameNumber: number) => {
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

  const { isTimelineInitialized, subscribe } = useTimeline(timeline_name);
  const [subscribed, setSubscribed] = useState(false);

  React.useEffect(() => {
    if (subscribed) return;
    if (isTimelineInitialized) {
      subscribe({
        id: panelId,
        loadRange,
        renderFrame: myRenderFrame,
      });
      setSubscribed(true);
    }
  }, [isTimelineInitialized, loadRange, myRenderFrame, subscribe]);

  return null;
}
