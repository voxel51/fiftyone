import React, { useEffect, useRef, useState } from "react";
import { ViewPropsType } from "../utils/types";
import { DEFAULT_FRAME_NUMBER } from "@fiftyone/playback/src/lib/constants";
import { BufferManager, BufferRange } from "@fiftyone/utilities";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId, useSetPanelStateById } from "@fiftyone/spaces";
import { useTimeline } from "@fiftyone/playback/src/lib/timeline/use-timeline";
import _ from "lodash";

const FRAME_LOADED_EVENT = "frames-loaded";

// the loaded frames and a signature that changes when they're reloaded
type FrameLoaderData = { frames?: unknown; signature?: string };

export default function FrameLoaderView(props: ViewPropsType) {
  const { schema, path } = props;
  const data = props.data as FrameLoaderData | undefined;
  const { view = {} } = schema;
  const { on_load_range, target, timeline_name } = view as {
    on_load_range: string;
    // path in the panel data to write the current frame's data to
    target: string;
    timeline_name?: string;
  };
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
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature identifies a new frames payload; frames itself is read only then
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
    // localIdRef is read when frames arrive, so it needn't be a dependency
    [triggerEvent, on_load_range, panelId],
  );

  const [_currentFrame, setCurrentFrame] = useState(DEFAULT_FRAME_NUMBER);

  const myRenderFrame = React.useCallback(
    (frameNumber: number) => {
      setPanelState(panelId, (current) => {
        const currentData = current.data ? _.cloneDeep(current.data) : {}; // Clone the object
        const currentFrameData = _.get(currentData, path, { frames: [] })
          .frames[frameNumber];
        const updatedData = { ...currentData };
        _.set(updatedData, target, currentFrameData); // Use lodash set to update safely
        return { ...current, data: updatedData };
      });
      setCurrentFrame(frameNumber);
    },
    [setPanelState, panelId, path, target],
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
  }, [
    isTimelineInitialized,
    loadRange,
    myRenderFrame,
    panelId,
    subscribe,
    subscribed,
  ]);

  return null;
}
