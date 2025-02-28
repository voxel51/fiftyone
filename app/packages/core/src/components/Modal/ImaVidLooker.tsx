import { useTheme } from "@fiftyone/components";
import { ImaVidLooker } from "@fiftyone/looker";
import type { FoTimelineConfig } from "@fiftyone/playback";
import {
  PLAYHEAD_STATE_BUFFERING,
  PLAYHEAD_STATE_PAUSED,
  PLAYHEAD_STATE_PLAYING,
  useCreateTimeline,
  useDefaultTimelineNameImperative,
  useTimeline,
} from "@fiftyone/playback";
import { Timeline } from "@fiftyone/playback/src/views/Timeline";
import * as fos from "@fiftyone/state";
import { useEventHandler, useOnSelectLabel } from "@fiftyone/state";
import type { BufferRange } from "@fiftyone/utilities";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { v4 as uuid } from "uuid";
import { useClearSelectedLabels, useShowOverlays } from "./ModalLooker";
import {
  useInitializeImaVidSubscriptions,
  useLookerOptionsUpdate,
  useModalContext,
} from "./hooks";
import useKeyEvents from "./use-key-events";
import { useImavidModalSelectiveRendering } from "./use-modal-selective-rendering";
import { shortcutToHelpItems } from "./utils";

interface ImaVidLookerReactProps {
  sample: fos.ModalSample;
}

/**
 * Imavid looker component with a timeline.
 */
export const ImaVidLookerReact = React.memo(
  ({ sample: sampleDataWithExtraParams }: ImaVidLookerReactProps) => {
    const [id] = useState(() => uuid());
    const colorScheme = useRecoilValue(fos.colorScheme);
    const dynamicGroupsTargetFrameRate = useRecoilValue(
      fos.dynamicGroupsTargetFrameRate
    );

    const { sample } = sampleDataWithExtraParams;

    const theme = useTheme();
    const initialRef = useRef<boolean>(true);
    const lookerOptions = fos.useLookerOptions(true);
    const [reset, setReset] = useState(false);
    const selectedMediaField = useRecoilValue(fos.selectedMediaField(true));
    const setModalLooker = useSetRecoilState(fos.modalLooker);
    const { subscribeToImaVidStateChanges } =
      useInitializeImaVidSubscriptions();

    const createLooker = fos.useCreateLooker(true, false, {
      ...lookerOptions,
    });

    const { activeLookerRef, setActiveLookerRef } = useModalContext();
    const imaVidLookerRef =
      activeLookerRef as React.MutableRefObject<ImaVidLooker>;

    const looker = React.useMemo(
      () => createLooker.current(sampleDataWithExtraParams),
      [reset, createLooker, selectedMediaField]
    ) as ImaVidLooker;

    useEffect(() => {
      setModalLooker(looker);
      if (looker instanceof ImaVidLooker) {
        subscribeToImaVidStateChanges();
      }
    }, [looker, subscribeToImaVidStateChanges]);

    useEffect(() => {
      if (looker) {
        setActiveLookerRef(looker);
      }
    }, [looker]);

    useEffect(() => {
      !initialRef.current && looker.updateOptions(lookerOptions);
    }, [lookerOptions]);

    useEffect(() => {
      !initialRef.current && looker.updateSample(sample);
    }, [sample, colorScheme]);

    useEffect(() => {
      return () => looker?.destroy();
    }, [looker]);

    const handleError = useErrorHandler();

    const updateLookerOptions = useLookerOptionsUpdate();
    useEventHandler(looker, "options", (e) => updateLookerOptions(e.detail));
    useEventHandler(looker, "showOverlays", useShowOverlays());
    useEventHandler(looker, "reset", () => {
      setReset((c) => !c);
    });

    const jsonPanel = fos.useJSONPanel();
    const helpPanel = fos.useHelpPanel();

    useEventHandler(looker, "select", useOnSelectLabel());
    useEventHandler(looker, "error", (event) => handleError(event.detail));
    useEventHandler(
      looker,
      "panels",
      async ({ detail: { showJSON, showHelp, SHORTCUTS } }) => {
        if (showJSON) {
          const imaVidFrameSample = (looker as ImaVidLooker).thisFrameSample;
          jsonPanel[showJSON](imaVidFrameSample);
        }
        if (showHelp) {
          if (showHelp == "close") {
            helpPanel.close();
          } else {
            helpPanel[showHelp](shortcutToHelpItems(SHORTCUTS));
          }
        }

        updateLookerOptions({}, (updatedOptions) =>
          looker.updateOptions(updatedOptions)
        );
      }
    );

    useEffect(() => {
      initialRef.current = false;
    }, []);

    useEffect(() => {
      looker.attach(id);
    }, [looker, id]);

    useEventHandler(looker, "clear", useClearSelectedLabels());

    useKeyEvents(initialRef, sample._id, looker);

    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      ref.current?.dispatchEvent(
        new CustomEvent(`looker-attached`, { bubbles: true })
      );
    }, [ref]);

    const loadRange = React.useCallback(
      async (range: Readonly<BufferRange>) => {
        const storeBufferManager =
          imaVidLookerRef.current.frameStoreController.storeBufferManager;
        const fetchBufferManager =
          imaVidLookerRef.current.frameStoreController.fetchBufferManager;

        if (storeBufferManager.containsRange(range)) {
          return;
        }

        const unprocessedStoreBufferRange =
          storeBufferManager.getUnprocessedBufferRange(range);
        const unprocessedBufferRange =
          fetchBufferManager.getUnprocessedBufferRange(
            unprocessedStoreBufferRange
          );

        if (!unprocessedBufferRange) {
          return;
        }

        // if looker is playing, don't change playhead to buffering status
        // we indicate buffering status in status bar
        if (getPlayHeadState() !== PLAYHEAD_STATE_PLAYING) {
          setPlayHeadState(PLAYHEAD_STATE_BUFFERING);
        }

        imaVidLookerRef.current.frameStoreController.enqueueFetch(
          unprocessedBufferRange
        );

        imaVidLookerRef.current.frameStoreController.resumeFetch();

        return new Promise<void>((resolve) => {
          const fetchMoreListener = (e: CustomEvent) => {
            if (
              e.detail.id === imaVidLookerRef.current.frameStoreController.key
            ) {
              if (storeBufferManager.containsRange(unprocessedBufferRange)) {
                // if we were buffering, set playhead state to playing
                if (getPlayHeadState() === PLAYHEAD_STATE_BUFFERING) {
                  setPlayHeadState(PLAYHEAD_STATE_PAUSED);
                }

                resolve();

                window.removeEventListener(
                  "fetchMore",
                  fetchMoreListener as EventListener
                );
              }
            }
          };

          window.addEventListener(
            "fetchMore",
            fetchMoreListener as EventListener
          );
        });
      },
      []
    );

    const renderFrame = React.useCallback((frameNumber: number) => {
      imaVidLookerRef.current?.element.drawFrameNoAnimation(frameNumber);
    }, []);

    const { getName } = useDefaultTimelineNameImperative();
    const timelineName = React.useMemo(() => getName(), [getName]);

    const [totalFrameCount, setTotalFrameCount] = useState<number | null>(null);

    const totalFrameCountRef = useRef<number | null>(null);

    const timelineCreationConfig = useMemo(() => {
      // todo: not working because it's resolved in a promise later
      // maybe emit event to update the total frames
      if (!totalFrameCount) {
        return undefined;
      }

      return {
        loop: (looker as ImaVidLooker).options.loop,
        targetFrameRate: dynamicGroupsTargetFrameRate,
        totalFrames: totalFrameCount,
      } as FoTimelineConfig;
    }, [totalFrameCount, (looker as ImaVidLooker).options.loop]);

    const readyWhen = useCallback(async () => {
      return new Promise<void>((resolve) => {
        // hack: wait for total frame count to be resolved
        let intervalId;
        intervalId = setInterval(() => {
          if (totalFrameCountRef.current) {
            clearInterval(intervalId);
            resolve();
          }
        }, 10);
      });
    }, []);

    const onAnimationStutter = useCallback(() => {
      imaVidLookerRef.current?.element.checkFetchBufferManager();
    }, []);

    const {
      isTimelineInitialized,
      registerOnPauseCallback,
      registerOnPlayCallback,
      registerOnSeekCallbacks,
      subscribe,
    } = useCreateTimeline({
      name: timelineName,
      config: timelineCreationConfig,
      waitUntilInitialized: readyWhen,
      // using this mechanism to resume fetch if it was paused
      // ideally we have control of fetch in this component but can't do that yet
      // since imavid is part of the grid too
      onAnimationStutter,
    });

    const { setPlayHeadState, getPlayHeadState } = useTimeline(timelineName);

    /**
     * This effect subscribes to the timeline.
     */
    useEffect(() => {
      if (isTimelineInitialized) {
        subscribe({
          id: `imavid-${sample._id}`,
          loadRange,
          renderFrame,
        });

        registerOnPlayCallback(() => {
          imaVidLookerRef.current?.element?.update(() => ({
            playing: true,
          }));
        });

        registerOnPauseCallback(() => {
          imaVidLookerRef.current?.element?.update(() => ({
            playing: false,
          }));
        });

        registerOnSeekCallbacks({
          start: () => {
            imaVidLookerRef.current?.element?.update(() => ({
              seeking: true,
            }));
          },
          end: () => {
            imaVidLookerRef.current?.element?.update(() => ({
              seeking: false,
            }));
          },
        });
      }
    }, [isTimelineInitialized, loadRange, renderFrame, subscribe]);

    /**
     * This effect sets the total frame count by polling the frame store controller.
     */
    useEffect(() => {
      // hack: poll every 10ms for total frame count
      // replace with event listener or callback
      let intervalId = setInterval(() => {
        const totalFrameCount =
          imaVidLookerRef.current.frameStoreController.totalFrameCount;
        if (totalFrameCount) {
          setTotalFrameCount(totalFrameCount);
          clearInterval(intervalId);
        }
      }, 10);

      return () => clearInterval(intervalId);
    }, [looker]);

    useImavidModalSelectiveRendering(id, looker);

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
        }}
      >
        <div
          ref={ref}
          id={id}
          data-cy="modal-looker-container"
          style={{
            width: "100%",
            height: "100%",
            background: theme.background.level2,
            position: "relative",
          }}
        />
        <Timeline
          name={timelineName}
          style={{
            position: "absolute",
            bottom: 0,
            width: "100%",
            height: "37px",
            zIndex: 1,
          }}
          controlsStyle={{
            marginLeft: "1em",
          }}
        />
      </div>
    );
  }
);
