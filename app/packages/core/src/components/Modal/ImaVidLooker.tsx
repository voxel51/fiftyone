import { useTheme } from "@fiftyone/components";
import { ImaVidLooker } from "@fiftyone/looker";
import type { FoTimelineConfig } from "@fiftyone/playback";
import {
  PLAYHEAD_STATE_BUFFERING,
  PLAYHEAD_STATE_PAUSED,
  PLAYHEAD_STATE_PLAYING,
  updateTimelineConfigAtom,
  useCreateTimeline,
  useDefaultTimelineNameImperative,
  useTimeline,
} from "@fiftyone/playback";
import { Timeline } from "@fiftyone/playback/src/views/Timeline/Timeline";
import * as fos from "@fiftyone/state";
import { jotaiStore } from "@fiftyone/state/src/jotai";
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
  showControls?: boolean;
}

/**
 * Imavid looker component with a timeline.
 */
export const ImaVidLookerReact = React.memo(
  ({
    sample: sampleDataWithExtraParams,
    showControls = true,
  }: ImaVidLookerReactProps) => {
    const [id] = useState(() => uuid());
    const colorScheme = useRecoilValue(fos.colorScheme);
    const dynamicGroupsTargetFrameRate = useRecoilValue(
      fos.dynamicGroupsTargetFrameRate
    );

    const { sample } = sampleDataWithExtraParams;

    const theme = useTheme();
    const initialRef = useRef<boolean>(true);
    const baseLookerOptions = fos.useLookerOptions(true);

    const lookerOptions = React.useMemo(
      () => ({ ...baseLookerOptions, showControls }),
      [baseLookerOptions, showControls]
    );

    const [reset, setReset] = useState(false);
    const selectedMediaField = useRecoilValue(fos.selectedMediaField(true));
    const setModalLooker = useSetRecoilState(fos.modalLooker);

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

    const { subscribeToImaVidStateChanges } =
      useInitializeImaVidSubscriptions();

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

        // background fetch of the missing range; never gates controls or playback.
        imaVidLookerRef.current.frameStoreController.enqueueFetch(
          unprocessedBufferRange
        );
        imaVidLookerRef.current.frameStoreController.resumeFetch();
      },
      []
    );

    const renderFrame = React.useCallback((frameNumber: number) => {
      imaVidLookerRef.current?.element.drawFrameNoAnimation(frameNumber);
    }, []);

    const { getName } = useDefaultTimelineNameImperative();
    const timelineName = React.useMemo(() => getName(), [getName]);

    // shared controller may already carry the group's length from a grid hover.
    const initialFrameCount =
      (looker as ImaVidLooker)?.frameStoreController?.totalFrameCount ?? null;

    const [totalFrameCount, setTotalFrameCount] = useState<number | null>(
      initialFrameCount
    );

    const totalFrameCountRef = useRef<number | null>(initialFrameCount);

    // true while the group is still streaming frames; drives the buffering indicator.
    const [isBuffering, setIsBuffering] = useState<boolean>(true);

    const timelineCreationConfig = useMemo(() => {
      // unknown count → `streaming` mode against buffered frames; real total fills in async.
      const streaming = totalFrameCount == null;
      return {
        loop: (looker as ImaVidLooker).options.loop,
        targetFrameRate: dynamicGroupsTargetFrameRate,
        totalFrames: totalFrameCount ?? 1,
        streaming,
      } as FoTimelineConfig;
    }, [totalFrameCount, (looker as ImaVidLooker).options.loop]);

    const readyWhen = useCallback(async () => {
      // resolve immediately — controls must not wait on the group's length.
      return Promise.resolve();
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
      // resumes fetch if it was paused
      onAnimationStutter,
    });

    const { setPlayHeadState, getPlayHeadState } = useTimeline(timelineName);

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

    // Poll for the group's true frame count (arrives async), syncing the timeline's
    // playable extent to buffered frames until it lands.
    useEffect(() => {
      let lastTarget = 0;
      const intervalId = setInterval(() => {
        const controller = imaVidLookerRef.current?.frameStoreController;
        if (!controller) {
          return;
        }
        const real = controller.totalFrameCount ?? null;
        const buffers = controller.storeBufferManager?.buffers ?? [];
        const bufferedMax = buffers.reduce(
          (max, range) => (range ? Math.max(max, range[1]) : max),
          0
        );

        if (real) {
          if (real !== lastTarget) {
            lastTarget = real;
            jotaiStore.set(updateTimelineConfigAtom, {
              name: timelineName,
              configDelta: { totalFrames: real },
            });
            setTotalFrameCount(real);
            totalFrameCountRef.current = real;
          }
          const done = bufferedMax >= real;
          setIsBuffering(!done);
          if (done) {
            clearInterval(intervalId);
          }
        } else {
          // length unknown — grow the bar with buffered frames until the stream reveals it.
          setIsBuffering(true);
          if (bufferedMax && bufferedMax !== lastTarget) {
            lastTarget = bufferedMax;
            jotaiStore.set(updateTimelineConfigAtom, {
              name: timelineName,
              configDelta: { totalFrames: bufferedMax },
            });
          }
        }
      }, 100);

      return () => clearInterval(intervalId);
    }, [looker, timelineName]);

    useImavidModalSelectiveRendering(id, looker);

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          // `overflow-x: hidden` alone forces overflow-y to `auto`, showing a stray
          // scrollbar on sub-pixel overflow; hide both axes (the canvas doesn't scroll).
          overflow: "hidden",
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
        {isBuffering && (
          <div
            style={{
              position: "absolute",
              bottom: "42px",
              right: "10px",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "2px 6px",
              borderRadius: "3px",
              background: "rgba(0,0,0,0.55)",
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                border: "2px solid rgba(255,255,255,0.25)",
                borderTopColor: "#ff6d04",
                borderRadius: "50%",
                display: "inline-block",
                animation: "imavid-buffer-spin 0.8s linear infinite",
              }}
            />
            <span
              style={{
                fontSize: "11px",
                color: "#bbb",
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
            >
              buffering…
            </span>
            <style>
              {"@keyframes imavid-buffer-spin{to{transform:rotate(360deg)}}"}
            </style>
          </div>
        )}
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
