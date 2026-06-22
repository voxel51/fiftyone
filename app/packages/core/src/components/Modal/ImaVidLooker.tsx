import { useTheme } from "@fiftyone/components";
import { ImaVidLooker } from "@fiftyone/looker";
import type { FoTimelineConfig } from "@fiftyone/playback";
import {
  useCreateTimeline,
  useDefaultTimelineNameImperative,
  useTimeline,
} from "@fiftyone/playback";
import { Timeline } from "@fiftyone/playback/src/views/Timeline/Timeline";
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

        // non-blocking: kick off the missing-range fetch in the background and return,
        // so the controls and playback never gate on buffering
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

    // the shared controller may already carry the group's length (a grid hover streamed
    // it); read it synchronously so the controls initialize with the real total
    const initialFrameCount =
      (looker as ImaVidLooker)?.frameStoreController?.totalFrameCount ?? null;

    const [totalFrameCount, setTotalFrameCount] = useState<number | null>(
      initialFrameCount
    );

    const totalFrameCountRef = useRef<number | null>(initialFrameCount);

    // true while the group is still streaming frames — drives the buffering indicator
    const [isBuffering, setIsBuffering] = useState<boolean>(true);

    const timelineCreationConfig = useMemo(() => {
      // when the real count is known initialize with it, else use `streaming` mode
      // against the buffered frames so playback starts before the total arrives
      const streaming = totalFrameCount == null;
      return {
        loop: (looker as ImaVidLooker).options.loop,
        targetFrameRate: dynamicGroupsTargetFrameRate,
        totalFrames: totalFrameCount ?? 1,
        streaming,
      } as FoTimelineConfig;
    }, [totalFrameCount, (looker as ImaVidLooker).options.loop]);

    const readyWhen = useCallback(async () => {
      // resolve immediately; the controls initialize against the buffered frames
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
      // using this mechanism to resume fetch if it was paused
      // ideally we have control of fetch in this component but can't do that yet
      // since imavid is part of the grid too
      onAnimationStutter,
    });

    const { setTotalFrames } = useTimeline(timelineName);

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
     * Poll for the group's true frame count (arrives async, never blocks the poster).
     * The timeline initializes only once it lands, so the seek bar shows the real total
     * and the playhead can't run past loaded frames.
     */
    useEffect(() => {
      // grow the timeline's playable extent with buffered frames while the group's
      // length is unknown, then snap to the real total once the stream reveals it
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
          // the group's true length is the correct denominator, so show it immediately
          if (real !== lastTarget) {
            lastTarget = real;
            setTotalFrames(real, false);
            setTotalFrameCount(real);
            totalFrameCountRef.current = real;
          }
          // still buffering until every frame of the group is loaded
          const done = bufferedMax >= real;
          setIsBuffering(!done);
          if (done) {
            clearInterval(intervalId);
          }
        } else {
          // length unknown (cold group): grow the bar with buffered frames meanwhile
          setIsBuffering(true);
          if (bufferedMax && bufferedMax !== lastTarget) {
            lastTarget = bufferedMax;
            setTotalFrames(bufferedMax, true);
          }
        }
      }, 100);

      return () => clearInterval(intervalId);
    }, [looker, setTotalFrames]);

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
              background: "var(--fo-palette-background-modalBackdrop)",
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                border: "2px solid var(--fo-palette-divider)",
                borderTopColor: "var(--fo-palette-voxel-500)",
                borderRadius: "50%",
                display: "inline-block",
                animation: "imavid-buffer-spin 0.8s linear infinite",
              }}
            />
            <span
              style={{
                fontSize: "11px",
                color: "var(--fo-palette-text-secondary)",
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
